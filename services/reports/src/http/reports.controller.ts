import {
  HEADERS,
  ROUTES,
  AiResult,
  AnalysisFailure,
  CreateAnalysisJob,
  DeterministicResult,
} from '@gyde/contracts';
import type { AnalysisAccepted, Report } from '@gyde/contracts';
import { ZodValidationPipe } from '@gyde/service-kit';
import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { CREATE_ANALYSIS, type CreateAnalysis } from '../application/create-analysis';
import { GET_REPORT, type GetReport } from '../application/get-report';
import { GET_REPORT_MARKDOWN, type GetReportMarkdown } from '../application/get-report-markdown';
import { RECORD_AI_RESULT, type RecordAiResult } from '../application/record-ai-result';
import {
  RECORD_ANALYSIS_FAILURE,
  type RecordAnalysisFailure,
} from '../application/record-analysis-failure';
import {
  RECORD_DETERMINISTIC_RESULT,
  type RecordDeterministicResult,
} from '../application/record-deterministic-result';
import {
  toAcceptedContract,
  toAiResultDto,
  toAnalysisFailureDto,
  toCreateAnalysisDto,
  toDeterministicResultDto,
  toGetReportDto,
  toReportContract,
} from './mappers/reports.mapper';

/**
 * HTTP surface of Reports: internal only. The gateway creates and reads analyses; Retrieval and
 * llm-analysis push their results here. Each handler validates, maps to a DTO, runs one use case
 * and maps the answer back to the contract.
 */
@Controller()
export class ReportsController {
  constructor(
    @Inject(CREATE_ANALYSIS) private readonly createAnalysis: CreateAnalysis,
    @Inject(GET_REPORT) private readonly getReport: GetReport,
    @Inject(GET_REPORT_MARKDOWN) private readonly getReportMarkdown: GetReportMarkdown,
    @Inject(RECORD_DETERMINISTIC_RESULT)
    private readonly recordDeterministicResult: RecordDeterministicResult,
    @Inject(RECORD_AI_RESULT) private readonly recordAiResult: RecordAiResult,
    @Inject(RECORD_ANALYSIS_FAILURE) private readonly recordAnalysisFailure: RecordAnalysisFailure,
  ) {}

  @Post(ROUTES.reports.createAnalysis)
  @HttpCode(202)
  async create(
    @Body(new ZodValidationPipe(CreateAnalysisJob)) body: CreateAnalysisJob,
  ): Promise<AnalysisAccepted> {
    return toAcceptedContract(await this.createAnalysis.execute(toCreateAnalysisDto(body)));
  }

  @Get(ROUTES.reports.getAnalysis)
  async get(
    @Param('analysisId') analysisId: string,
    @Headers(HEADERS.tenantId) tenantId: string | undefined,
  ): Promise<Report> {
    return toReportContract(await this.getReport.execute(toGetReportDto(analysisId, tenantId)));
  }

  /**
   * The header is set only on the success path: with a `@Header` decorator Fastify would refuse
   * to send the JSON error envelope of a missing analysis (it would answer 500 instead of 404).
   */
  @Get(ROUTES.reports.getMarkdown)
  async getMarkdown(
    @Param('analysisId') analysisId: string,
    @Headers(HEADERS.tenantId) tenantId: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<string> {
    const markdown = await this.getReportMarkdown.execute(toGetReportDto(analysisId, tenantId));
    reply.header('content-type', 'text/markdown; charset=utf-8');
    return markdown;
  }

  /** Called by Retrieval to deliver the deterministic result. */
  @Post(ROUTES.reports.deterministicResult)
  @HttpCode(204)
  recordDeterministic(
    @Param('analysisId') analysisId: string,
    @Body(new ZodValidationPipe(DeterministicResult)) body: DeterministicResult,
  ): Promise<void> {
    return this.recordDeterministicResult.execute(toDeterministicResultDto(analysisId, body));
  }

  /** Called by llm-analysis to deliver the AI result. */
  @Post(ROUTES.reports.aiResult)
  @HttpCode(204)
  recordAi(
    @Param('analysisId') analysisId: string,
    @Body(new ZodValidationPipe(AiResult)) body: AiResult,
  ): Promise<void> {
    return this.recordAiResult.execute(toAiResultDto(analysisId, body));
  }

  /** Called by Retrieval or llm-analysis when a stage fails. */
  @Post(ROUTES.reports.failure)
  @HttpCode(204)
  recordFailure(
    @Param('analysisId') analysisId: string,
    @Body(new ZodValidationPipe(AnalysisFailure)) body: AnalysisFailure,
  ): Promise<void> {
    return this.recordAnalysisFailure.execute(toAnalysisFailureDto(analysisId, body));
  }
}
