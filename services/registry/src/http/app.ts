import { ROUTES, ServiceRegistration } from '@gyde/contracts';
import {
  type FastifyInstance,
  type Logger,
  buildApp,
  registerStubRoutes,
  requireInternalToken,
} from '@gyde/service-kit';

import type { Config } from '../config';

export interface AppDeps {
  config: Config;
  logger: Logger;
}

/**
 * HTTP surface of the registry. It lives on the internal network only: every `/v1/*` call must
 * carry the internal token, so nothing outside our own services can register or resolve.
 */
export function createApp({ config, logger }: AppDeps): FastifyInstance {
  const app = buildApp({ name: 'registry', logger });

  const guard = requireInternalToken(config.INTERNAL_SERVICE_TOKEN);
  app.addHook('onRequest', async (request) => {
    if (request.url.startsWith('/v1/')) {
      await guard(request);
    }
  });

  registerStubRoutes(app, [
    { method: 'POST', url: ROUTES.registry.instances, body: ServiceRegistration },
    { method: 'DELETE', url: ROUTES.registry.instance },
    { method: 'PUT', url: ROUTES.registry.heartbeat },
    { method: 'GET', url: ROUTES.registry.resolve },
  ]);

  return app;
}
