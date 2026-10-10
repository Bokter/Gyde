import { ROUTES, KnowledgeQuery } from '@gyde/contracts';
import { notImplemented, ZodValidationPipe } from '@gyde/service-kit';
import { Body, Controller, Get, Post } from '@nestjs/common';

/**
 * HTTP surface of the normalization service: internal only (every route is under /internal).
 *
 * Every method answers `501 not_implemented` (and already validates its body) until you replace
 * `notImplemented(...)` with a call to a use case injected with `@Inject(UseCase)`.
 */
@Controller()
export class NormalizationController {
  @Post(ROUTES.normalization.query)
  query(@Body(new ZodValidationPipe(KnowledgeQuery)) _body: KnowledgeQuery): never {
    return notImplemented('POST', ROUTES.normalization.query);
  }

  @Get(ROUTES.normalization.sources)
  sources(): never {
    return notImplemented('GET', ROUTES.normalization.sources);
  }

  @Post(ROUTES.normalization.ingest)
  ingest(): never {
    return notImplemented('POST', ROUTES.normalization.ingest);
  }
}
