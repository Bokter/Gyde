import type { ReportRepository, StoredAnalysis } from '../application/ports/report-repository';

/**
 * In-memory adapter of the `ReportRepository` port. Used until the PostgreSQL repository lands
 * (schema `reports`); tests and local development run against it. Data dies with the process.
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
}
