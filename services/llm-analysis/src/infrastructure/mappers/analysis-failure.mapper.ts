import type { AnalysisFailure } from '@gyde/contracts';

import type { AnalysisFailureDto } from '../../application/dto/llm-analysis.dto';

/** The failure as the body published to Reports (the shapes are identical). */
export function toAnalysisFailureContract(failure: AnalysisFailureDto): AnalysisFailure {
  return failure;
}
