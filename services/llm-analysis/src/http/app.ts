import { LlmAnalysisRequest, ROUTES } from '@gyde/contracts';
import {
  type FastifyInstance,
  type Logger,
  buildApp,
  protectInternalRoutes,
  registerStubRoutes,
} from '@gyde/service-kit';

import type { Config } from '../config';

export interface AppDeps {
  config: Config;
  logger: Logger;
}

/** HTTP surface of llm-analysis: internal only. Retrieval is its only caller. */
export function createApp({ config, logger }: AppDeps): FastifyInstance {
  const app = buildApp({ name: 'llm-analysis', logger });
  protectInternalRoutes(app, config.INTERNAL_SERVICE_TOKEN);

  // The real handler answers 202 at once and runs `AnalyzeFindings` in the background: the result
  // goes to Reports (`AiResult`, or `AnalysisFailure` when the AI cannot run).
  registerStubRoutes(app, [
    { method: 'POST', url: ROUTES.llmAnalysis.analyze, body: LlmAnalysisRequest },
  ]);

  return app;
}
