import {
  ROUTES,
  AiResult,
  AnalysisFailure,
  CreateAnalysisJob,
  DeterministicResult,
} from '@gyde/contracts';
import type { AnalysisAccepted, Report } from '@gyde/contracts';
import { ZodValidationPipe } from '@gyde/service-kit';
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { ANALYSIS_LIFECYCLE } from '../application/analysis-lifecycle';
import type { AnalysisLifecycle } from '../application/analysis-lifecycle';
import { renderMarkdown } from '../domain/report/render-markdown';

/**
 * HTTP surface of Reports: internal only. The gateway creates and reads analyses; Retrieval and
 * llm-analysis push their results here.
 *
 * `create` and `get` are live. Record endpoints and markdown are now live too.
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

  /**
   * The header is set only on the success path: with a `@Header` decorator Fastify would refuse
   * to send the JSON error envelope of a missing analysis (it would answer 500 instead of 404).
   */
  @Get(ROUTES.reports.getMarkdown)
  async getMarkdown(
    @Param('analysisId') analysisId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<string> {
    const report = await this.lifecycle.getReport(analysisId);
    reply.header('content-type', 'text/markdown; charset=utf-8');
    return renderMarkdown(report);
  }

  /**
   * Called by Retrieval to deliver the deterministic result.
   * The `:analysisId` path parameter is the authoritative id; it overwrites what the body carries
   * so the use case never has to trust the body alone.
   */
  @Post(ROUTES.reports.deterministicResult)
  @HttpCode(204)
  recordDeterministic(
    @Param('analysisId') analysisId: string,
    @Body(new ZodValidationPipe(DeterministicResult)) body: DeterministicResult,
  ): Promise<void> {
    return this.lifecycle.recordDeterministic({ ...body, analysisId });
  }

  /**
   * Called by llm-analysis to deliver the AI result.
   * Same convention: path analysisId is authoritative.
   */
  @Post(ROUTES.reports.aiResult)
  @HttpCode(204)
  recordAi(
    @Param('analysisId') analysisId: string,
    @Body(new ZodValidationPipe(AiResult)) body: AiResult,
  ): Promise<void> {
    return this.lifecycle.recordAi({ ...body, analysisId });
  }

  /**
   * Called by Retrieval or llm-analysis when a stage fails.
   * Same convention: path analysisId is authoritative.
   */
  @Post(ROUTES.reports.failure)
  @HttpCode(204)
  recordFailure(
    @Param('analysisId') analysisId: string,
    @Body(new ZodValidationPipe(AnalysisFailure)) body: AnalysisFailure,
  ): Promise<void> {
    return this.lifecycle.recordFailure({ ...body, analysisId });
  }
}
