import type { Evidence, Finding } from '../report/report-types';

/**
 * Domain copy of the messages the analysis pipeline exchanges. Same literal unions as the
 * contract, so contract values are assignable here without casts (a test pins it).
 */

export type AnalysisStatus = 'pending' | 'retrieving' | 'analyzing' | 'ready' | 'failed';

export type Plan = 'free' | 'pro' | 'studio';

/** What a tenant may do. Limits use `null` for "unlimited". */
export interface Entitlements {
  plan: Plan;
  limits: {
    analysesPerMonth: number | null;
    projects: number | null;
  };
  features: {
    licenseCompliance: boolean;
    compatibilityAnalysis: boolean;
    severityScoring: boolean;
    aiEnrichment: boolean;
  };
}

/** Retrieval -> Reports: the deterministic part. */
export interface DeterministicResult {
  analysisId: string;
  findings: Finding[];
  evidence: Evidence[];
  coverage: {
    vulnerabilities: boolean;
    compatibility: boolean;
    licenses: boolean;
  };
  partialSources: boolean;
}

/** llm-analysis -> Reports: prioritized and explained findings. */
export interface AiResult {
  analysisId: string;
  findings: Finding[];
  summary?: string;
}

/** Retrieval or llm-analysis -> Reports when a stage cannot complete. */
export interface AnalysisFailure {
  analysisId: string;
  stage: 'retrieval' | 'llm';
  reason: 'retrieval-error' | 'llm-unavailable' | 'llm-not-configured' | 'llm-error';
  message: string;
}

/** Everything Reports remembers about one analysis (the persisted state of the entity). */
export interface AnalysisSnapshot {
  id: string;
  tenantId: string;
  entitlements: Entitlements;
  /** The client asked for AI and the plan allows it: Reports waits for llm-analysis. */
  aiExpected: boolean;
  status: AnalysisStatus;
  createdAt: string;
  completedAt?: string;
  deterministic?: DeterministicResult;
  ai?: AiResult;
  failure?: AnalysisFailure;
}
