import { Analysis } from '../domain/analysis/analysis';
import type { AnalysisFailureDto } from './dto/analysis.dto';
import { AnalysisNotFoundError } from './errors';
import type { ReportRepository } from './ports/report-repository';

export const RECORD_ANALYSIS_FAILURE = Symbol('RecordAnalysisFailure');

/**
 * Called by Retrieval or llm-analysis when a stage cannot complete: `llm` closes the job as ready
 * and degraded (only when AI was expected), `retrieval` as failed. Ignored once the job is done.
 */
export class RecordAnalysisFailure {
  constructor(
    private readonly repository: ReportRepository,
    private readonly options: { now?: () => Date } = {},
  ) {}

  async execute(failure: AnalysisFailureDto): Promise<void> {
    const snapshot = await this.repository.get(failure.analysisId);
    if (!snapshot) throw new AnalysisNotFoundError(failure.analysisId);

    const analysis = Analysis.rehydrate(snapshot);
    if (!analysis.recordFailure(failure, this.options.now ? this.options.now() : new Date())) {
      return;
    }
    await this.repository.update(analysis.snapshot());
  }
}
