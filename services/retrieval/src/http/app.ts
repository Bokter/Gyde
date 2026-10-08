import { ROUTES, RetrieveRequest } from '@gyde/contracts';
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

/** HTTP surface of Retrieval: internal only. Reports is its only caller. */
export function createApp({ config, logger }: AppDeps): FastifyInstance {
  const app = buildApp({ name: 'retrieval', logger });
  protectInternalRoutes(app, config.INTERNAL_SERVICE_TOKEN);

  // The real handler answers 202 at once and runs `RetrieveEvidence` in the background: results
  // travel to Reports (and llm-analysis) through their own endpoints.
  registerStubRoutes(app, [
    { method: 'POST', url: ROUTES.retrieval.retrieve, body: RetrieveRequest },
  ]);

  return app;
}
