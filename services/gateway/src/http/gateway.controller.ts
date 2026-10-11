import { ROUTES, AnalysisRequest } from '@gyde/contracts';
import { notImplemented, ZodValidationPipe } from '@gyde/service-kit';
import { Body, Controller, Get, Post } from '@nestjs/common';

/**
 * HTTP surface of the gateway: the PUBLIC API used by the CLI, the GitHub Action and the extension.
 * It never serves `/internal/*`.
 *
 * Every method answers `501 not_implemented` (and already validates its body) until you replace
 * `notImplemented(...)` with a call to a use case injected with `@Inject(UseCase)`.
 */
@Controller()
export class GatewayController {
  @Get(ROUTES.gateway.verify)
  verify(): never {
    return notImplemented('GET', ROUTES.gateway.verify);
  }

  @Post(ROUTES.gateway.analyses)
  createAnalysis(@Body(new ZodValidationPipe(AnalysisRequest)) _body: AnalysisRequest): never {
    return notImplemented('POST', ROUTES.gateway.analyses);
  }

  @Get(ROUTES.gateway.analysis)
  getAnalysis(): never {
    return notImplemented('GET', ROUTES.gateway.analysis);
  }

  @Get(ROUTES.gateway.analysisMarkdown)
  getAnalysisMarkdown(): never {
    return notImplemented('GET', ROUTES.gateway.analysisMarkdown);
  }
}
