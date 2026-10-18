import type { AnalysisSnapshot, AnalysisStatus } from '../../domain/analysis/analysis-types';

/** Port to persistence (PostgreSQL schema `reports`). */
export interface ReportRepository {
  create(analysis: AnalysisSnapshot): Promise<void>;
  get(id: string): Promise<AnalysisSnapshot | undefined>;
  update(analysis: AnalysisSnapshot): Promise<void>;
  /**
   * Analyses in `status` whose last write is older than `cutoff`: the input of the startup sweep
   * (`SweepStaleAnalyses`). The in-memory adapter returns `[]`, since a restart empties it anyway.
   */
  findStale(status: AnalysisStatus, cutoff: Date): Promise<AnalysisSnapshot[]>;
}

/** DI token of the `ReportRepository` port: `app.module.ts` binds it to an adapter (see ADR 0011). */
export const REPORT_REPOSITORY = Symbol('ReportRepository');
