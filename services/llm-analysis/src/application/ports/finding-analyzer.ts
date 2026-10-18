import type { AiAnalysis, AnalysisInput } from '../../domain/analysis';
import type { TenantLlmConfig } from '../dto/llm-analysis.dto';

/**
 * Port to ONE LLM provider. Implementations live in `infrastructure/adapters/` (anthropic,
 * openai, and a deterministic mock for tests and demos).
 *
 * The provider interprets and correlates the evidence with the project context and returns
 * prioritized, explained findings. Validate the model output before returning it (the adapters
 * do it with the `AiResult` contract): never trust free text from a model.
 */
export interface FindingAnalyzer {
  analyze(request: AnalysisInput, credentials: TenantLlmConfig): Promise<AiAnalysis>;
}

/**
 * DI token of the `FindingAnalyzer` port: `app.module.ts` binds it to the Anthropic adapter (see
 * ADR 0011) and registers it in the provider → analyzer map that `AnalyzeFindingsUseCase` selects from.
 */
export const FINDING_ANALYZER = Symbol('FindingAnalyzer');
