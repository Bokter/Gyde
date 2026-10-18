import type { ReportRepository } from '../application/ports/report-repository';
import type { AnalysisSnapshot, AnalysisStatus } from '../domain/analysis/analysis-types';

/**
 * In-memory adapter of the `ReportRepository` port. Used when `REPORTS_DATABASE_URL` is not set:
 * tests and local development run against it. Data dies with the process.
 */
export class InMemoryReportRepository implements ReportRepository {
  private readonly store = new Map<string, AnalysisSnapshot>();

  async create(analysis: AnalysisSnapshot): Promise<void> {
    this.store.set(analysis.id, structuredClone(analysis));
  }

  async get(id: string): Promise<AnalysisSnapshot | undefined> {
    const found = this.store.get(id);
    return found ? structuredClone(found) : undefined;
  }

  async update(analysis: AnalysisSnapshot): Promise<void> {
    this.store.set(analysis.id, structuredClone(analysis));
  }

  /** Nothing is stale: after a restart this store is empty, and while it lives the timers run. */
  async findStale(_status: AnalysisStatus, _cutoff: Date): Promise<AnalysisSnapshot[]> {
    return [];
  }
}
