import { type AnalysisAccepted, LlmAnalysisRequest, ROUTES } from '@gyde/contracts';
import { ZodValidationPipe } from '@gyde/service-kit';
import { Body, Controller, HttpCode, Inject, Logger, Post } from '@nestjs/common';

import { AnalyzeFindings } from '../application/analyze-findings';
import { BackgroundJobs } from '../application/background-jobs';
import { toAnalysisAcceptedContract, toAnalyzeFindingsDto } from './mappers/llm-analysis.mapper';

/**
 * HTTP surface of llm-analysis: internal only. Retrieval is its only caller.
 *
 * It answers 202 at once and runs `AnalyzeFindings` in the background: the result goes to Reports
 * (`AiResult`, or `AnalysisFailure` when the AI cannot run). The AI never answers the caller.
 */
@Controller()
export class LlmAnalysisController {
  private readonly logger = new Logger(LlmAnalysisController.name);

  constructor(
    @Inject(AnalyzeFindings) private readonly analyzeFindings: AnalyzeFindings,
    @Inject(BackgroundJobs) private readonly jobs: BackgroundJobs,
  ) {}

  @Post(ROUTES.llmAnalysis.analyze)
  @HttpCode(202)
  analyze(
    @Body(new ZodValidationPipe(LlmAnalysisRequest)) body: LlmAnalysisRequest,
  ): AnalysisAccepted {
    const dto = toAnalyzeFindingsDto(body);
    this.jobs.run(
      () => this.analyzeFindings.execute(dto),
      // `execute` handles its own failures; this only catches a bug in it.
      (error) =>
        this.logger.error(
          `Unexpected error analyzing ${dto.analysisId}: ${error instanceof Error ? error.message : 'unknown'}`,
        ),
    );
    return toAnalysisAcceptedContract(dto.analysisId);
  }
}
