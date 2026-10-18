import { InvalidRecordError } from '../../domain/invalid-record-error';
import type { KnowledgeObject } from '../../domain/entities/knowledge-object.entity';
import type { IngestResultDto } from '../dto/knowledge.dto';
import { IngestionFailedError, IngestionInProgressError, UnknownSourceError } from '../errors';
import type { KnowledgeRepository } from '../../domain/repositories/knowledge.repository';
import type { SourceAdapter } from '../ports/source-adapter';

export interface IngestSourceDeps {
  adapters: readonly SourceAdapter[];
  repository: KnowledgeRepository;
  /** Injectable clock. */
  now?: () => Date;
}

/** Objects per `upsertMany`: bounds memory on a large first ingestion. */
const BATCH_SIZE = 500;

/**
 * Ingests ONE source: fetch what changed since its last successful run, normalize, store.
 *
 * - Idempotent: objects are keyed by id, so repeating a run never duplicates.
 * - A malformed record is skipped and counted; it does not stop the rest of the source.
 * - A source that is down fails alone: the attempt is recorded and what was stored earlier keeps
 *   being served. The next run starts again from the last SUCCESSFUL one.
 * - One run per source at a time.
 */
export class IngestSourceUseCase {
  private readonly running = new Set<string>();
  private readonly now: () => Date;

  constructor(private readonly deps: IngestSourceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async execute(sourceName: string): Promise<IngestResultDto> {
    const adapter = this.deps.adapters.find((candidate) => candidate.name === sourceName);
    if (!adapter) throw new UnknownSourceError(sourceName);
    if (this.running.has(sourceName)) throw new IngestionInProgressError(sourceName);

    this.running.add(sourceName);
    const startedAt = this.now();
    try {
      const since = await this.deps.repository.lastIngestedAt(sourceName);
      let processed = 0;
      let skipped = 0;
      let batch: KnowledgeObject[] = [];

      const flush = async () => {
        await this.deps.repository.upsertMany(batch);
        processed += batch.length;
        batch = [];
      };

      for await (const record of adapter.fetchChanges(since)) {
        try {
          const objects = adapter.normalize(record);
          if (objects.length === 0) skipped += 1;
          batch.push(...objects);
        } catch (error) {
          if (!(error instanceof InvalidRecordError)) throw error;
          skipped += 1;
        }
        if (batch.length >= BATCH_SIZE) await flush();
      }
      if (batch.length > 0) await flush();

      const finishedAt = this.now();
      await this.deps.repository.recordRun({
        source: sourceName,
        status: 'success',
        startedAt,
        finishedAt,
        recordsProcessed: processed,
      });
      return {
        source: sourceName,
        recordsProcessed: processed,
        recordsSkipped: skipped,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
      };
    } catch (error) {
      const reason = describe(error);
      await this.deps.repository.recordRun({
        source: sourceName,
        status: 'failed',
        startedAt,
        finishedAt: this.now(),
        recordsProcessed: 0,
        error: reason,
      });
      throw new IngestionFailedError(sourceName, reason);
    } finally {
      this.running.delete(sourceName);
    }
  }
}

/** A short, secret-free reason: the message of the error, never a stack or a request. */
function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : 'unknown error';
  return message.slice(0, 500);
}
