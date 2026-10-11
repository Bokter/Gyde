import type { SourceStatus, SourcesStatus } from '@gyde/contracts';

import type { KnowledgeRepository } from './ports/knowledge-repository';
import type { SourceAdapter } from './ports/source-adapter';

export interface ListSourcesDeps {
  adapters: readonly SourceAdapter[];
  repository: KnowledgeRepository;
}

/** Last ingestion time and state of every configured source (`GET /internal/sources`). */
export class ListSources {
  constructor(private readonly deps: ListSourcesDeps) {}

  async execute(): Promise<SourcesStatus> {
    const sources = await Promise.all(
      [...this.deps.adapters]
        .sort((a, b) => a.name.localeCompare(b.name, 'en'))
        .map((adapter) => this.statusOf(adapter)),
    );
    return { sources };
  }

  private async statusOf(adapter: SourceAdapter): Promise<SourceStatus> {
    const [lastIngestedAt, lastRun] = await Promise.all([
      this.deps.repository.lastIngestedAt(adapter.name),
      this.deps.repository.lastRun(adapter.name),
    ]);
    return {
      name: adapter.name,
      kind: adapter.kind,
      trust: adapter.trust,
      status: lastRun === undefined ? 'never' : lastRun.status === 'success' ? 'ok' : 'failed',
      ...(lastIngestedAt && { lastIngestedAt: lastIngestedAt.toISOString() }),
      ...(lastRun && { lastAttemptAt: lastRun.finishedAt.toISOString() }),
      ...(lastRun?.status === 'failed' && lastRun.error && { lastError: lastRun.error }),
    };
  }
}
