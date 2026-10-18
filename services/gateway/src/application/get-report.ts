import type { Report } from '@gyde/contracts';

import type { Principal } from '../domain/principal';
import type { RequestContext } from './request-context';
import type { ReportsClient } from './ports/reports-client';

/** `GET /v1/analyses/:id` and `/markdown`. A missing analysis is Reports' 404, passed along. */
export class GetReport {
  constructor(private readonly reports: ReportsClient) {}

  json(principal: Principal, analysisId: string, context: RequestContext): Promise<Report> {
    return this.reports.getReport(analysisId, { ...context, tenantId: principal.tenantId });
  }

  markdown(principal: Principal, analysisId: string, context: RequestContext): Promise<string> {
    return this.reports.getMarkdown(analysisId, { ...context, tenantId: principal.tenantId });
  }
}
