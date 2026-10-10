import { ROUTES, RetrieveRequest } from '@gyde/contracts';
import { notImplemented, ZodValidationPipe } from '@gyde/service-kit';
import { Body, Controller, Post } from '@nestjs/common';

/**
 * HTTP surface of Retrieval: internal only. Reports is its only caller.
 *
 * The real handler answers 202 at once (`@HttpCode(202)`) and runs `RetrieveEvidence` in the
 * background: results travel to Reports (and llm-analysis) through their own endpoints.
 *
 * Every method answers `501 not_implemented` (and already validates its body) until you replace
 * `notImplemented(...)` with a call to a use case injected with `@Inject(UseCase)`.
 */
@Controller()
export class RetrievalController {
  @Post(ROUTES.retrieval.retrieve)
  retrieve(@Body(new ZodValidationPipe(RetrieveRequest)) _body: RetrieveRequest): never {
    return notImplemented('POST', ROUTES.retrieval.retrieve);
  }
}
