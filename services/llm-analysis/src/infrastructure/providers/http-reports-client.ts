import { ROUTES, buildPath } from '@gyde/contracts';
import { type ResilientHttpClient } from '@gyde/service-kit';

import type { AiResultDto, AnalysisFailureDto } from '../../application/dto/llm-analysis.dto';
import type { ReportsClient } from '../../application/ports/reports-client';
import { toAiResultContract } from '../mappers/ai-result.mapper';
import { toAnalysisFailureContract } from '../mappers/analysis-failure.mapper';

/**
 * HTTP adapter of the `ReportsClient` port: where the AI result (or the reason it could not run)
 * is delivered. Reports owns the analysis lifecycle, so it receives the message and answers 204.
 */
export class HttpReportsClient implements ReportsClient {
  constructor(private readonly http: ResilientHttpClient) {}

  async publishAiResult(result: AiResultDto): Promise<void> {
    const path = buildPath(ROUTES.reports.aiResult, { analysisId: result.analysisId });
    await this.http.postJson('reports', path, toAiResultContract(result));
  }

  async publishFailure(failure: AnalysisFailureDto): Promise<void> {
    const path = buildPath(ROUTES.reports.failure, { analysisId: failure.analysisId });
    await this.http.postJson('reports', path, toAnalysisFailureContract(failure));
  }
}
