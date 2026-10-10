import {
  ROUTES,
  AiResult,
  AnalysisFailure,
  CreateAnalysisJob,
  DeterministicResult,
} from '@gyde/contracts';
import { notImplemented, ZodValidationPipe } from '@gyde/service-kit';
import { Body, Controller, Get, Post } from '@nestjs/common';

/**
 * HTTP surface of Reports: internal only. The gateway creates and reads analyses; Retrieval and
 * llm-analysis push their results here.
 *
 * Every method answers `501 not_implemented` (and already validates its body) until you replace
 * `notImplemented(...)` with a call to a use case injected with `@Inject(UseCase)`.
 */
@Controller()
export class ReportsController {
  @Post(ROUTES.reports.createAnalysis)
  create(@Body(new ZodValidationPipe(CreateAnalysisJob)) _body: CreateAnalysisJob): never {
    return notImplemented('POST', ROUTES.reports.createAnalysis);
  }

  @Get(ROUTES.reports.getAnalysis)
  get(): never {
    return notImplemented('GET', ROUTES.reports.getAnalysis);
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
