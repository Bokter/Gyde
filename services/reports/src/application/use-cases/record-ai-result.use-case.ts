import type { AiResultDto } from '../dto/analysis.dto';
import { AnalysisNotFoundError } from '../errors';
import type { ReportRepository } from '../ports/report-repository';

export const RECORD_AI_RESULT = Symbol('RecordAiResultUseCase');

/**
 * Called by llm-analysis when the AI enrichment finishes. Late results (the job is already `ready`
 * or `failed`) are ignored; one that arrives before the deterministic result is kept until that
 * one completes the job.
 */
export class RecordAiResultUseCase {
  constructor(
    private readonly repository: ReportRepository,
    private readonly options: { now?: () => Date } = {},
  ) {}

  async execute(result: AiResultDto): Promise<void> {
    const analysis = await this.repository.get(result.analysisId);
    if (!analysis) throw new AnalysisNotFoundError(result.analysisId);

    if (!analysis.recordAi(result, this.options.now ? this.options.now() : new Date())) return;
    await this.repository.update(analysis);
  }
}
