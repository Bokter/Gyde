import type { AiAnalysis, AnalysisInput } from '../../domain/analysis';

/** Why the AI layer could not run; the reasons Reports shows in a degraded report. */
export type FailureReason = 'llm-unavailable' | 'llm-not-configured' | 'llm-error';

/** LLM providers a tenant can bring a key for; same literals as the contract. */
export type LlmProviderName = 'anthropic' | 'gemini' | 'openai';

/** Input of the `AnalyzeFindings` use case: the evidence of one analysis and whose key to use. */
export type AnalyzeFindingsDto = AnalysisInput & {
  tenantId: string;
};

/** What is published to Reports when the model answered. */
export type AiResultDto = AiAnalysis;

/** What is published to Reports when the AI layer could not run. */
export type AnalysisFailureDto = {
  analysisId: string;
  stage: 'llm';
  reason: FailureReason;
  message: string;
};

/**
 * The tenant's LLM configuration (BYOK).
 *
 * SECURITY: `apiKey` is a DECRYPTED secret. Use it for one call; never log it, persist it, or put
 * it in a message (everything that leaves the service goes through `redactSecrets`).
 */
export type TenantLlmConfig = {
  tenantId: string;
  provider: LlmProviderName;
  model: string;
  apiKey: string;
};
