import type { AiResultDto, AnalysisFailureDto } from '../dto/llm-analysis.dto';

/** Port to the Reports service: where the AI result (or the reason it could not run) is delivered. */
export interface ReportsClient {
  publishAiResult(result: AiResultDto): Promise<void>;
  publishFailure(failure: AnalysisFailureDto): Promise<void>;
}

/** DI token of the `ReportsClient` port: `app.module.ts` binds it to an adapter (see ADR 0011). */
export const REPORTS_CLIENT = Symbol('ReportsClient');
