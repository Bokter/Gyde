import type { AnalysisAccepted, AnalysisRequest, CreateAnalysisJob } from '@gyde/contracts';

import type { Principal, RequestContext } from './principal';
import type { ReportsClient } from './ports/reports-client';

/** `POST /v1/analyses`: wraps the request with the tenant and its entitlements for Reports. */
export class SubmitAnalysis {
  constructor(private readonly reports: ReportsClient) {}

  execute(
    principal: Principal,
    request: AnalysisRequest,
    context: RequestContext,
  ): Promise<AnalysisAccepted> {
    const job: CreateAnalysisJob = {
      tenantId: principal.tenantId,
      entitlements: principal.entitlements,
      request,
    };
    return this.reports.createAnalysis(job, { ...context, tenantId: principal.tenantId });
  }
}
