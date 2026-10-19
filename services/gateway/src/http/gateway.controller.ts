import {
  type AnalysisAccepted,
  AnalysisRequest,
  type AuthVerifyResponse,
  type Report,
  ROUTES,
} from '@gyde/contracts';
import { ZodValidationPipe } from '@gyde/service-kit';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';

import { GetReportUseCase } from '../application/use-cases/get-report.use-case';
import type { RequestContext } from '../application/request-context';
import type { Principal } from '../domain/principal';
import { SubmitAnalysisUseCase } from '../application/use-cases/submit-analysis.use-case';
import { ApiKeyGuard } from './api-key.guard';
import { RateLimitGuard } from './rate-limit.guard';
import {
  toAnalysisAcceptedContract,
  toAnalysisRequestDto,
  toAuthVerifyResponse,
} from './mappers/gateway.mapper';
import { CurrentContext, CurrentPrincipal } from './request-principal';

interface MarkdownReply {
  header(name: string, value: string): unknown;
}

/**
 * HTTP surface of the gateway: the PUBLIC API used by the CLI, the GitHub Action and the extension.
 * Every route needs an API key. It never serves `/internal/*`: those paths do not exist here.
 */
@Controller()
@UseGuards(ApiKeyGuard, RateLimitGuard)
export class GatewayController {
  constructor(
    @Inject(SubmitAnalysisUseCase) private readonly submitAnalysis: SubmitAnalysisUseCase,
    @Inject(GetReportUseCase) private readonly getReport: GetReportUseCase,
  ) {}

  @Get(ROUTES.gateway.verify)
  verify(@CurrentPrincipal() principal: Principal): AuthVerifyResponse {
    return toAuthVerifyResponse(principal);
  }

  @Post(ROUTES.gateway.analyses)
  @HttpCode(202)
  async createAnalysis(
    @CurrentPrincipal() principal: Principal,
    @CurrentContext() context: RequestContext,
    @Body(new ZodValidationPipe(AnalysisRequest)) body: AnalysisRequest,
  ): Promise<AnalysisAccepted> {
    const accepted = await this.submitAnalysis.execute(
      principal,
      toAnalysisRequestDto(body),
      context,
    );
    return toAnalysisAcceptedContract(accepted);
  }

  @Get(ROUTES.gateway.analysis)
  getAnalysis(
    @CurrentPrincipal() principal: Principal,
    @CurrentContext() context: RequestContext,
    @Param('analysisId') analysisId: string,
  ): Promise<Report> {
    return this.getReport.json(principal, analysisId, context);
  }

  /** The header is set only on success, so an error keeps its JSON envelope (see Reports). */
  @Get(ROUTES.gateway.analysisMarkdown)
  async getAnalysisMarkdown(
    @CurrentPrincipal() principal: Principal,
    @CurrentContext() context: RequestContext,
    @Param('analysisId') analysisId: string,
    @Res({ passthrough: true }) reply: MarkdownReply,
  ): Promise<string> {
    const markdown = await this.getReport.markdown(principal, analysisId, context);
    reply.header('content-type', 'text/markdown; charset=utf-8');
    return markdown;
  }
}
