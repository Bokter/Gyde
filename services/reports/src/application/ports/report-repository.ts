import type { Analysis } from '../../domain/entities/analysis.entity';
import type { AnalysisStatus } from '../../domain/entities/analysis-types';

/** Port to persistence (PostgreSQL schema `reports`): it stores and returns the `Analysis` entity. */
export interface ReportRepository {
  create(analysis: Analysis): Promise<void>;
  get(id: string): Promise<Analysis | undefined>;
  update(analysis: Analysis): Promise<void>;
  /**
   * Analyses in `status` whose last write is older than `cutoff`: the input of the startup sweep
   * (`SweepStaleAnalyses`). The in-memory adapter returns `[]`, since a restart empties it anyway.
   */
  findStale(status: AnalysisStatus, cutoff: Date): Promise<Analysis[]>;
}

/** DI token of the `ReportRepository` port: `app.module.ts` binds it to an adapter (see ADR 0011). */
export const REPORT_REPOSITORY = Symbol('ReportRepository');
