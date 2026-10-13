import { KnowledgeQuery, ROUTES } from '@gyde/contracts';
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

/** HTTP surface of the normalization service: internal only (every route is under /internal). */
export function createApp({ config, logger }: AppDeps): FastifyInstance {
  const app = buildApp({ name: 'normalization', logger });
  protectInternalRoutes(app, config.INTERNAL_SERVICE_TOKEN);

  registerStubRoutes(app, [
    { method: 'POST', url: ROUTES.normalization.query, body: KnowledgeQuery },
    { method: 'GET', url: ROUTES.normalization.sources },
    { method: 'POST', url: ROUTES.normalization.ingest },
  ]);

  return app;
}
