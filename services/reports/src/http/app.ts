import {
  AiResult,
  AnalysisFailure,
  CreateAnalysisJob,
  DeterministicResult,
  ROUTES,
} from '@gyde/contracts';
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

/**
 * HTTP surface of Reports: internal only. The gateway creates and reads analyses; Retrieval and
 * llm-analysis push their results here.
 */
export function createApp({ config, logger }: AppDeps): FastifyInstance {
  const app = buildApp({ name: 'reports', logger });
  protectInternalRoutes(app, config.INTERNAL_SERVICE_TOKEN);

  registerStubRoutes(app, [
    { method: 'POST', url: ROUTES.reports.createAnalysis, body: CreateAnalysisJob },
    { method: 'GET', url: ROUTES.reports.getAnalysis },
    { method: 'GET', url: ROUTES.reports.getMarkdown },
    { method: 'POST', url: ROUTES.reports.deterministicResult, body: DeterministicResult },
    { method: 'POST', url: ROUTES.reports.aiResult, body: AiResult },
    { method: 'POST', url: ROUTES.reports.failure, body: AnalysisFailure },
  ]);

  return app;
}
