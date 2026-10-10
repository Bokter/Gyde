import { type LlmAnalysisRequest, ROUTES } from '@gyde/contracts';

import { LlmUnavailableError } from '../application/errors';
import type { LlmClient } from '../application/ports/downstream';
import { type InternalHttpClient, ServiceUnavailableError } from './internal-http-client';

/**
 * Hands the evidence to llm-analysis. Fire and forget: the AI result reaches Reports directly.
 * An outage (service down, circuit open, no healthy instance) becomes `LlmUnavailableError`,
 * which the use case reports to Reports as `llm-unavailable`.
 */
export class HttpLlmClient implements LlmClient {
  constructor(private readonly client: InternalHttpClient) {}

  async dispatch(request: LlmAnalysisRequest): Promise<void> {
    try {
      await this.client.postJson('llm-analysis', ROUTES.llmAnalysis.analyze, request);
    } catch (error) {
      if (error instanceof ServiceUnavailableError) throw new LlmUnavailableError(error.message);
      throw error;
    }
  }
}
