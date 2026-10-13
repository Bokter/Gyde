import type { AiResult, AnalysisFailure } from '@gyde/contracts';

/** Port to the Reports service: where the AI result (or the reason it could not run) is delivered. */
export interface ReportsClient {
  publishAiResult(result: AiResult): Promise<void>;
  publishFailure(failure: AnalysisFailure): Promise<void>;
}
