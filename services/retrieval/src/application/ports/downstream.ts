import type { AnalysisFailure, DeterministicResult, LlmAnalysisRequest } from '@gyde/contracts';

/** Port to the Reports service: where the deterministic result (and any failure) is delivered. */
export interface ReportsClient {
  publishDeterministicResult(result: DeterministicResult): Promise<void>;
  publishFailure(failure: AnalysisFailure): Promise<void>;
}

/**
 * Port to the llm-analysis service. Fire and forget: the AI result reaches Reports directly, and
 * if this call cannot be made the report simply stays deterministic (degraded).
 */
export interface LlmClient {
  dispatch(request: LlmAnalysisRequest): Promise<void>;
}
