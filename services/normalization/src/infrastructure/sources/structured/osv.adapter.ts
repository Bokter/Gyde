import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { KnowledgeObject, SourceKind, Trust } from '@gyde/contracts';
import type { CircuitBreaker } from '@gyde/resilience';

import type { RawRecord, SourceAdapter } from '../../../application/ports/source-adapter';
import { InvalidRecordError } from '../../../domain/invalid-record-error';
import { normalizeOsvRecord } from '../../../domain/osv-normalizer';

export interface OsvAdapterOptions {
  /** With fixtures the adapter reads `<fixturesDir>/osv/*.json` and never touches the network. */
  useFixtures: boolean;
  /** `fixtures/sources` (only read when `useFixtures`). */
  fixturesDir: string;
  /** OSV API, e.g. https://api.osv.dev (only used when not `useFixtures`). */
  apiUrl: string;
  /** Static bucket that lists what changed per ecosystem (only used when not `useFixtures`). */
  bucketUrl: string;
  /** Wraps every network call: an OSV outage must not stop the other sources. */
  breaker: CircuitBreaker;
  /** Injectable for tests. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Injectable clock (stamps `ingestedAt`). */
  now?: () => Date;
}

/** First ingestion has no `since`: take the advisories modified in this window only. */
const INITIAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const CALL_TIMEOUT_MS = 10_000;
/** OSV ecosystems Gyde cares about; the bucket folder is the ecosystem name. */
const OSV_ECOSYSTEMS = ['NuGet'] as const;

/**
 * OSV (`structured`, high trust). Fixtures: `fixtures/sources/osv/*.json`. Real: the changed-ids
 * list of the OSV bucket plus `GET /v1/vulns/{id}` of the API.
 */
export class OsvAdapter implements SourceAdapter {
  readonly name = 'osv';
  readonly kind: SourceKind = 'structured';
  readonly trust: Trust = 'high';

  private readonly fetchFn: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly options: OsvAdapterOptions) {
    this.fetchFn = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  fetchChanges(since?: Date): AsyncIterable<RawRecord> {
    return this.options.useFixtures ? this.fromFixtures(since) : this.fromApi(since);
  }

  normalize(record: RawRecord): KnowledgeObject[] {
    return normalizeOsvRecord(record.payload, this.now().toISOString());
  }

  private async *fromFixtures(since?: Date): AsyncGenerator<RawRecord> {
    const folder = join(this.options.fixturesDir, 'osv');
    const files = (await readdir(folder)).filter((file) => file.endsWith('.json')).sort();
    for (const file of files) {
      const payload: unknown = JSON.parse(await readFile(join(folder, file), 'utf8'));
      const { id, modified } = payload as { id?: unknown; modified?: unknown };
      if (typeof id !== 'string') throw new InvalidRecordError('osv', file, 'missing id');
      if (since && typeof modified === 'string' && new Date(modified) <= since) continue;
      yield { sourceId: id, payload };
    }
  }

  private async *fromApi(since?: Date): AsyncGenerator<RawRecord> {
    const threshold = since ?? new Date(this.now().getTime() - INITIAL_WINDOW_MS);
    for (const ecosystem of OSV_ECOSYSTEMS) {
      const csv = await this.get(`${this.options.bucketUrl}/${ecosystem}/modified_id.csv`);
      for (const id of changedSince(await csv.text(), threshold)) {
        const response = await this.get(
          `${this.options.apiUrl}/v1/vulns/${encodeURIComponent(id)}`,
          {
            allowNotFound: true,
          },
        );
        // A 404 is an advisory withdrawn between the listing and the fetch: nothing to ingest.
        if (response.status === 404) continue;
        yield { sourceId: id, payload: await response.json() };
      }
    }
  }

  private get(url: string, { allowNotFound = false } = {}): Promise<Response> {
    return this.options.breaker.execute(async () => {
      const response = await this.fetchFn(url, { signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
      if (!response.ok && !(allowNotFound && response.status === 404)) {
        throw new Error(`OSV answered ${response.status}`);
      }
      return response;
    });
  }
}

/** `modified_id.csv` lines are `<ISO modified>,<id>`; keeps the ids modified after `threshold`. */
function changedSince(csv: string, threshold: Date): string[] {
  const ids: string[] = [];
  for (const line of csv.split('\n')) {
    const [modified, id] = line.trim().split(',');
    if (modified && id && new Date(modified) > threshold) ids.push(id);
  }
  return ids;
}
