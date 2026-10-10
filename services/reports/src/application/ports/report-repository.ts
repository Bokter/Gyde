import type {
  AiResult,
  AnalysisFailure,
  DeterministicResult,
  Entitlements,
  ReportStatus,
} from '@gyde/contracts';

/** Everything Reports remembers about one analysis while it runs (and afterwards). */
export interface StoredAnalysis {
  id: string;
  tenantId: string;
  entitlements: Entitlements;
  /** The client asked for AI and the plan allows it: Reports waits for llm-analysis. */
  aiExpected: boolean;
  status: ReportStatus;
  createdAt: string;
  completedAt?: string;
  deterministic?: DeterministicResult;
  ai?: AiResult;
  failure?: AnalysisFailure;
}

/** Port to persistence (PostgreSQL schema `reports`). */
export interface ReportRepository {
  create(analysis: StoredAnalysis): Promise<void>;
  get(id: string): Promise<StoredAnalysis | undefined>;
  update(analysis: StoredAnalysis): Promise<void>;
}

/** DI token of the `ReportRepository` port: `app.module.ts` binds it to an adapter (see ADR 0011). */
export const REPORT_REPOSITORY = Symbol('ReportRepository');
