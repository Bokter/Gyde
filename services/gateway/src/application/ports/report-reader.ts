import type { Report } from '@gyde/contracts';

import type { RequestContext } from '../request-context';

export const REPORT_READER = Symbol('ReportReader');

/**
 * The Reports endpoints that read an analysis. Pass-through: the `Report` of the contract goes
 * to the caller as is (listed in the README as a contract exception of `application/`).
 */
export interface ReportReader {
  getReport(analysisId: string, context: RequestContext & { tenantId: string }): Promise<Report>;
  getMarkdown(analysisId: string, context: RequestContext & { tenantId: string }): Promise<string>;
}
