import { z } from 'zod';

import { AnalysisRequest, ProjectContext } from './analysis';
import { Entitlements } from './auth';
import { Id } from './common';
import { Evidence, Finding } from './findings';

/**
 * Messages exchanged between backend services while an analysis runs:
 *
 *   Gateway ──CreateAnalysisJob──▶ Reports ──RetrieveRequest──▶ Retrieval
 *   Retrieval ──DeterministicResult──▶ Reports
 *   Retrieval ──LlmAnalysisRequest──▶ llm-analysis ──AiResult──▶ Reports
 *   Retrieval | llm-analysis ──AnalysisFailure──▶ Reports
 */

/** Gateway → Reports. Entitlements are resolved by the gateway from the API key. */
export const CreateAnalysisJob = z.strictObject({
  tenantId: Id,
  entitlements: Entitlements,
  request: AnalysisRequest,
});
export type CreateAnalysisJob = z.infer<typeof CreateAnalysisJob>;

/** Reports → Retrieval. */
export const RetrieveRequest = z.strictObject({
  analysisId: Id,
  tenantId: Id,
  entitlements: Entitlements,
  request: AnalysisRequest,
});
export type RetrieveRequest = z.infer<typeof RetrieveRequest>;

/** Retrieval → Reports: the deterministic part, which exists even if the LLM never answers. */
export const DeterministicResult = z.strictObject({
  analysisId: Id,
  findings: z.array(Finding),
  evidence: z.array(Evidence),
  coverage: z.strictObject({
    vulnerabilities: z.boolean(),
    compatibility: z.boolean(),
    licenses: z.boolean(),
  }),
  /**
   * True when some knowledge sources could not be queried. It does NOT make the report
   * degraded: a report is degraded only when the expected AI layer could not run.
   */
  partialSources: z.boolean().default(false),
});
export type DeterministicResult = z.infer<typeof DeterministicResult>;

/** Retrieval → llm-analysis. */
export const LlmAnalysisRequest = z.strictObject({
  analysisId: Id,
  /** Used to fetch the tenant's own LLM key (BYOK). */
  tenantId: Id,
  project: ProjectContext,
  findings: z.array(Finding),
  evidence: z.array(Evidence),
});
export type LlmAnalysisRequest = z.infer<typeof LlmAnalysisRequest>;

/** llm-analysis → Reports: prioritized and explained findings. */
export const AiResult = z.strictObject({
  analysisId: Id,
  findings: z.array(Finding),
  summary: z.string().max(4000).optional(),
});
export type AiResult = z.infer<typeof AiResult>;

/** Retrieval or llm-analysis → Reports when a stage cannot complete. */
export const AnalysisFailure = z.strictObject({
  analysisId: Id,
  stage: z.enum(['retrieval', 'llm']),
  reason: z.enum(['retrieval-error', 'llm-unavailable', 'llm-not-configured', 'llm-error']),
  message: z.string().max(1000),
});
export type AnalysisFailure = z.infer<typeof AnalysisFailure>;
