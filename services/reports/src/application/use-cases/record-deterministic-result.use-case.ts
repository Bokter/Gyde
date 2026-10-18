import type { AnalysisWatchdog } from '../analysis-watchdog';
import type { DeterministicResultDto } from '../dto/analysis.dto';
import { AnalysisNotFoundError } from '../errors';
import type { ReportRepository } from '../ports/report-repository';

export const RECORD_DETERMINISTIC_RESULT = Symbol('RecordDeterministicResultUseCase');

/**
 * Called by Retrieval when the deterministic pass finishes. With AI expected the job moves to
 * `analyzing` and the AI watchdog is armed (unless the AI result already arrived); otherwise it is
 * `ready`. A delivery to a job that is no longer `retrieving` is a duplicate and is ignored.
 */
export class RecordDeterministicResultUseCase {
  constructor(
    private readonly repository: ReportRepository,
    private readonly watchdog: AnalysisWatchdog,
    private readonly options: { now?: () => Date } = {},
  ) {}

  async execute(result: DeterministicResultDto): Promise<void> {
    const analysis = await this.repository.get(result.analysisId);
    if (!analysis) throw new AnalysisNotFoundError(result.analysisId);

    const outcome = analysis.recordDeterministic(
      result,
      this.options.now ? this.options.now() : new Date(),
    );
    if (outcome === 'ignored') return;

    await this.repository.update(analysis);
    if (outcome === 'analyzing') this.watchdog.armAiTimeout(result.analysisId);
  }
}
