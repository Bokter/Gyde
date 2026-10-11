import { type AiResult, type AnalysisFailure, ROUTES, buildPath } from '@gyde/contracts';
import { type ResilientHttpClient } from '@gyde/service-kit';

import type { ReportsClient } from '../../application/ports/reports-client';

/**
 * HTTP adapter of the `ReportsClient` port: where the AI result (or the reason it could not run)
 * is delivered. Reports owns the analysis lifecycle, so it receives the message and answers 204.
 */
export class HttpReportsClient implements ReportsClient {
  constructor(private readonly http: ResilientHttpClient) {}

  async publishAiResult(result: AiResult): Promise<void> {
    const path = buildPath(ROUTES.reports.aiResult, { analysisId: result.analysisId });
    await this.http.postJson('reports', path, result);
  }

  async publishFailure(failure: AnalysisFailure): Promise<void> {
    const path = buildPath(ROUTES.reports.failure, { analysisId: failure.analysisId });
    await this.http.postJson('reports', path, failure);
  }
}
