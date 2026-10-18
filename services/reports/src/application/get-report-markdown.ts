import { renderMarkdown } from '../domain/report/render-markdown';
import type { GetReportDto } from './dto/analysis.dto';
import type { GetReport } from './get-report';

export const GET_REPORT_MARKDOWN = Symbol('GetReportMarkdown');

/** The same report as `GetReport` (same tenant rule), rendered as Markdown. */
export class GetReportMarkdown {
  constructor(private readonly getReport: GetReport) {}

  async execute(query: GetReportDto): Promise<string> {
    return renderMarkdown(await this.getReport.execute(query));
  }
}
