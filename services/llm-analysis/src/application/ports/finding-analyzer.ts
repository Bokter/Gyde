import type { AiResult, InternalLlmConfig, LlmAnalysisRequest } from '@gyde/contracts';

/**
 * Port to ONE LLM provider. Implementations live in `infrastructure/providers/` (anthropic,
 * openai, and a deterministic mock for tests and demos).
 *
 * The provider interprets and correlates the evidence with the project context and returns
 * prioritized, explained findings. Validate the model output with the `AiResult` schema before
 * returning it: never trust free text from a model.
 */
export interface FindingAnalyzer {
  analyze(request: LlmAnalysisRequest, credentials: InternalLlmConfig): Promise<AiResult>;
}
