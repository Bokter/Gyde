import type { AnalysisAccepted, LlmAnalysisRequest } from '@gyde/contracts';

import type { AnalyzeFindingsDto } from '../../application/dto/llm-analysis.dto';

/**
 * Contract -> use case input. The request is passed through, not rebuilt: its key order is part of
 * the prompt the model receives and of the fallback cache fingerprint.
 */
export function toAnalyzeFindingsDto(request: LlmAnalysisRequest): AnalyzeFindingsDto {
  return request;
}

/** The immediate answer of `POST /internal/analyze`: the work continues in the background. */
export function toAnalysisAcceptedContract(analysisId: string): AnalysisAccepted {
  return { analysisId, status: 'analyzing' };
}
