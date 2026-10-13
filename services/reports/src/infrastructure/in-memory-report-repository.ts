import type { ReportStatus } from '@gyde/contracts';

import type { ReportRepository, StoredAnalysis } from '../application/ports/report-repository';

/**
 * In-memory adapter of the `ReportRepository` port. Used when `REPORTS_DATABASE_URL` is not set:
 * tests and local development run against it. Data dies with the process.
 */
export class InMemoryReportRepository implements ReportRepository {
  private readonly store = new Map<string, StoredAnalysis>();

  async create(analysis: StoredAnalysis): Promise<void> {
    this.store.set(analysis.id, structuredClone(analysis));
  }

  async get(id: string): Promise<StoredAnalysis | undefined> {
    const found = this.store.get(id);
    return found ? structuredClone(found) : undefined;
  }

  async update(analysis: StoredAnalysis): Promise<void> {
    this.store.set(analysis.id, structuredClone(analysis));
  }

  /** Nothing is stale: after a restart this store is empty, and while it lives the timers run. */
  async findStale(_status: ReportStatus, _cutoff: Date): Promise<StoredAnalysis[]> {
    return [];
  }
}
