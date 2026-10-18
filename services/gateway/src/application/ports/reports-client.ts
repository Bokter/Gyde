import type { AnalysisAcceptedDto, CreateAnalysisJobDto } from '../dto/gateway.dto';
import type { RequestContext } from '../request-context';

export const REPORTS_CLIENT = Symbol('ReportsClient');

/** The Reports endpoint that starts an analysis. The response comes back already validated. */
export interface ReportsClient {
  createAnalysis(
    job: CreateAnalysisJobDto,
    context: RequestContext & { tenantId: string },
  ): Promise<AnalysisAcceptedDto>;
}
