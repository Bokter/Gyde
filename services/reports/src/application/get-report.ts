import { buildReport } from '../domain/report/build-report';
import type { GetReportDto, ReportDto } from './dto/analysis.dto';
import { AnalysisNotFoundError } from './errors';
import type { ReportRepository } from './ports/report-repository';

export const GET_REPORT = Symbol('GetReport');

/**
 * `tenantId` is the tenant the gateway resolved from the API key. An analysis that belongs to
 * another tenant (or a call without a tenant) answers exactly like one that does not exist.
 */
export class GetReport {
  constructor(private readonly repository: ReportRepository) {}

  async execute(query: GetReportDto): Promise<ReportDto> {
    const analysis = await this.repository.get(query.analysisId);
    if (!analysis || !analysis.isOwnedBy(query.tenantId))
      throw new AnalysisNotFoundError(query.analysisId);
    return buildReport(analysis.snapshot());
  }
}
