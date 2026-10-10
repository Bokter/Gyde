import { ROUTES, LlmAnalysisRequest } from '@gyde/contracts';
import { notImplemented, ZodValidationPipe } from '@gyde/service-kit';
import { Body, Controller, Post } from '@nestjs/common';

/**
 * HTTP surface of llm-analysis: internal only. Retrieval is its only caller.
 *
 * The real handler answers 202 at once (`@HttpCode(202)`) and runs `AnalyzeFindings` in the
 * background: the result goes to Reports (`AiResult`, or `AnalysisFailure` when the AI cannot run).
 *
 * Every method answers `501 not_implemented` (and already validates its body) until you replace
 * `notImplemented(...)` with a call to a use case injected with `@Inject(UseCase)`.
 */
@Controller()
export class LlmAnalysisController {
  @Post(ROUTES.llmAnalysis.analyze)
  analyze(@Body(new ZodValidationPipe(LlmAnalysisRequest)) _body: LlmAnalysisRequest): never {
    return notImplemented('POST', ROUTES.llmAnalysis.analyze);
  }
}
