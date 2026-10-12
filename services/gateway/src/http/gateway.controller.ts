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

import { GetReport } from '../application/get-report';
import type { Principal, RequestContext } from '../application/principal';
import { SubmitAnalysis } from '../application/submit-analysis';
import { ApiKeyGuard } from './api-key.guard';
import { RateLimitGuard } from './rate-limit.guard';
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
    @Inject(SubmitAnalysis) private readonly submitAnalysis: SubmitAnalysis,
    @Inject(GetReport) private readonly getReport: GetReport,
  ) {}

  /** The entitlements are the ones Web returned for the key: they are not recomputed. */
  @Get(ROUTES.gateway.verify)
  verify(@CurrentPrincipal() principal: Principal): AuthVerifyResponse {
    return { plan: principal.entitlements.plan, entitlements: principal.entitlements };
  }

  @Post(ROUTES.gateway.analyses)
  @HttpCode(202)
  createAnalysis(
    @CurrentPrincipal() principal: Principal,
    @CurrentContext() context: RequestContext,
    @Body(new ZodValidationPipe(AnalysisRequest)) body: AnalysisRequest,
  ): Promise<AnalysisAccepted> {
    return this.submitAnalysis.execute(principal, body, context);
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
