import { ROUTES } from '@gyde/contracts';
import type { ResilientHttpClient } from '@gyde/service-kit';

import type { LlmAnalysisRequestDto } from '../application/dto/retrieval.dto';
import { LlmUnavailableError } from '../application/errors';
import type { LlmClient } from '../application/ports/downstream';
import { toLlmAnalysisRequestContract } from './mappers/pipeline.mapper';
import { ServiceUnavailableError, toUnavailable } from './unavailable';

/**
 * Hands the evidence to llm-analysis. Fire and forget: the AI result reaches Reports directly.
 * An outage (service down, circuit open, no healthy instance) becomes `LlmUnavailableError`,
 * which the use case reports to Reports as `llm-unavailable`; a refusal (4xx) stays an error of
 * its own and is reported as `llm-error`.
 */
export class HttpLlmClient implements LlmClient {
  constructor(private readonly http: ResilientHttpClient) {}

  async dispatch(request: LlmAnalysisRequestDto): Promise<void> {
    try {
      await this.http.postJson(
        'llm-analysis',
        ROUTES.llmAnalysis.analyze,
        toLlmAnalysisRequestContract(request),
      );
    } catch (error) {
      const failure = toUnavailable('llm-analysis', error);
      if (failure instanceof ServiceUnavailableError)
        throw new LlmUnavailableError(failure.message);
      throw failure;
    }
  }
}
