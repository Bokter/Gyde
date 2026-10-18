import type { ReportRepository } from '../../src/application/ports/report-repository';
import type { RetrievalClient } from '../../src/application/ports/retrieval-client';
import type { AnalysisSnapshot, AnalysisStatus } from '../../src/domain/analysis/analysis-types';

/** Fake repository: records every call so the tests can assert on it. */
export class FakeRepository implements ReportRepository {
  readonly store = new Map<string, AnalysisSnapshot>();
  readonly calls: string[] = [];
  /** Makes the update that finishes a job fail (the watchdog runs one of those). */
  failReadyUpdates = false;

  async create(analysis: AnalysisSnapshot): Promise<void> {
    this.calls.push(`create:${analysis.id}`);
    this.store.set(analysis.id, structuredClone(analysis));
  }

  async get(id: string): Promise<AnalysisSnapshot | undefined> {
    this.calls.push(`get:${id}`);
    const found = this.store.get(id);
    return found ? structuredClone(found) : undefined;
  }

  async update(analysis: AnalysisSnapshot): Promise<void> {
    if (this.failReadyUpdates && analysis.status === 'ready') throw new Error('db is down');
    this.calls.push(`update:${analysis.id}`);
    this.store.set(analysis.id, structuredClone(analysis));
  }

  /**
   * Nothing is stale: the timers of this process cover every job it started, and the startup
   * sweep only runs when the app is built with a database (PostgreSQL tests use the real one).
   */
  async findStale(_status: AnalysisStatus, _cutoff: Date): Promise<AnalysisSnapshot[]> {
    return [];
  }
}

/** Fake retrieval: records the requests it received; can be told to fail. */
export class FakeRetrieval implements RetrievalClient {
  readonly requests: unknown[] = [];
  failWith?: Error;

  async retrieve(request: unknown): Promise<void> {
    this.requests.push(request);
    if (this.failWith) throw this.failWith;
  }
}
