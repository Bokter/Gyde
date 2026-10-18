import { AiResult } from '@gyde/contracts';

import type { AiAnalysis } from '../../domain/analysis';

/**
 * Validates an analysis with the `AiResult` contract. Providers call it before returning, inside
 * the breaker-protected call, so an invalid result is a failed call (and never reaches the
 * fallback cache) exactly as before the refactor.
 */
export function parseAiResult(analysis: AiAnalysis): AiResult {
  return AiResult.parse(analysis);
}

/** The analysis as the body published to Reports (the same value: the shapes are identical). */
export function toAiResultContract(analysis: AiAnalysis): AiResult {
  return analysis;
}
