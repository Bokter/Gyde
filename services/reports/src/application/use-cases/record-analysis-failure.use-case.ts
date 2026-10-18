import type { AnalysisFailureDto } from '../dto/analysis.dto';
import { AnalysisNotFoundError } from '../errors';
import type { ReportRepository } from '../ports/report-repository';

export const RECORD_ANALYSIS_FAILURE = Symbol('RecordAnalysisFailureUseCase');

/**
 * Called by Retrieval or llm-analysis when a stage cannot complete: `llm` closes the job as ready
 * and degraded (only when AI was expected), `retrieval` as failed. Ignored once the job is done.
 */
export class RecordAnalysisFailureUseCase {
  constructor(
    private readonly repository: ReportRepository,
    private readonly options: { now?: () => Date } = {},
  ) {}

  async execute(failure: AnalysisFailureDto): Promise<void> {
    const analysis = await this.repository.get(failure.analysisId);
    if (!analysis) throw new AnalysisNotFoundError(failure.analysisId);

    if (!analysis.recordFailure(failure, this.options.now ? this.options.now() : new Date())) {
      return;
    }
    await this.repository.update(analysis);
  }
}
