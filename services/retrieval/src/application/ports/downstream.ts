import type {
  AnalysisFailureDto,
  DeterministicResultDto,
  LlmAnalysisRequestDto,
} from '../dto/retrieval.dto';

/** Port to the Reports service: where the deterministic result (and any failure) is delivered. */
export interface ReportsClient {
  publishDeterministicResult(result: DeterministicResultDto): Promise<void>;
  publishFailure(failure: AnalysisFailureDto): Promise<void>;
}

/**
 * Port to the llm-analysis service. Fire and forget: the AI result reaches Reports directly, and
 * if this call cannot be made the report simply stays deterministic (degraded).
 */
export interface LlmClient {
  dispatch(request: LlmAnalysisRequestDto): Promise<void>;
}

/** DI token of the `ReportsClient` port: `app.module.ts` binds it to an adapter (see ADR 0011). */
export const REPORTS_CLIENT = Symbol('ReportsClient');

/** DI token of the `LlmClient` port: `app.module.ts` binds it to an adapter (see ADR 0011). */
export const LLM_CLIENT = Symbol('LlmClient');
