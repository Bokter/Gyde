import { renderMarkdown } from '../../domain/report/render-markdown';
import type { GetReportDto } from '../dto/analysis.dto';
import type { GetReportUseCase } from './get-report.use-case';

export const GET_REPORT_MARKDOWN = Symbol('GetReportMarkdownUseCase');

/** The same report as `GetReportUseCase` (same tenant rule), rendered as Markdown. */
export class GetReportMarkdownUseCase {
  constructor(private readonly getReport: GetReportUseCase) {}

  async execute(query: GetReportDto): Promise<string> {
    return renderMarkdown(await this.getReport.execute(query));
  }
}
