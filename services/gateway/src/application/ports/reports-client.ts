import type { AnalysisAccepted, CreateAnalysisJob, Report } from '@gyde/contracts';

import type { RequestContext } from '../request-context';

export const REPORTS_CLIENT = Symbol('ReportsClient');

/** The Reports endpoints the gateway uses. Responses come back already validated. */
export interface ReportsClient {
  createAnalysis(
    job: CreateAnalysisJob,
    context: RequestContext & { tenantId: string },
  ): Promise<AnalysisAccepted>;
  getReport(analysisId: string, context: RequestContext & { tenantId: string }): Promise<Report>;
  getMarkdown(analysisId: string, context: RequestContext & { tenantId: string }): Promise<string>;
}
