import {
  ROUTES,
  AiResult,
  AnalysisFailure,
  CreateAnalysisJob,
  DeterministicResult,
} from '@gyde/contracts';
import type { AnalysisAccepted, Report } from '@gyde/contracts';
import { notImplemented, ZodValidationPipe } from '@gyde/service-kit';
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';

import { ANALYSIS_LIFECYCLE } from '../application/analysis-lifecycle';
import type { AnalysisLifecycle } from '../application/analysis-lifecycle';

/**
 * HTTP surface of Reports: internal only. The gateway creates and reads analyses; Retrieval and
 * llm-analysis push their results here.
 *
 * `create` and `get` are live; the remaining endpoints still answer `501 not_implemented`
 * (and already validate their body) until their use cases land.
 */
@Controller()
export class ReportsController {
  constructor(@Inject(ANALYSIS_LIFECYCLE) private readonly lifecycle: AnalysisLifecycle) {}

  @Post(ROUTES.reports.createAnalysis)
  @HttpCode(202)
  create(
    @Body(new ZodValidationPipe(CreateAnalysisJob)) body: CreateAnalysisJob,
  ): Promise<AnalysisAccepted> {
    return this.lifecycle.create(body);
  }

  @Get(ROUTES.reports.getAnalysis)
  get(@Param('analysisId') analysisId: string): Promise<Report> {
    return this.lifecycle.getReport(analysisId);
  }

  @Get(ROUTES.reports.getMarkdown)
  getMarkdown(): never {
    return notImplemented('GET', ROUTES.reports.getMarkdown);
  }

  @Post(ROUTES.reports.deterministicResult)
  recordDeterministic(
    @Body(new ZodValidationPipe(DeterministicResult)) _body: DeterministicResult,
  ): never {
    return notImplemented('POST', ROUTES.reports.deterministicResult);
  }

  @Post(ROUTES.reports.aiResult)
  recordAi(@Body(new ZodValidationPipe(AiResult)) _body: AiResult): never {
    return notImplemented('POST', ROUTES.reports.aiResult);
  }

  @Post(ROUTES.reports.failure)
  recordFailure(@Body(new ZodValidationPipe(AnalysisFailure)) _body: AnalysisFailure): never {
    return notImplemented('POST', ROUTES.reports.failure);
  }
}
