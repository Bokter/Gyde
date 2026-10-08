import { AnalysisRequest, ROUTES } from '@gyde/contracts';
import { type FastifyInstance, type Logger, buildApp, registerStubRoutes } from '@gyde/service-kit';

import type { Config } from '../config';

export interface AppDeps {
  config: Config;
  logger: Logger;
}

/**
 * HTTP surface of the gateway: the PUBLIC API used by the CLI, the GitHub Action and the extension.
 * Each stub answers 501 (and already validates its body) until it is replaced by a handler that
 * calls a use case from `application/`.
 */
export function createApp({ logger }: AppDeps): FastifyInstance {
  const app = buildApp({ name: 'gateway', logger });

  registerStubRoutes(app, [
    { method: 'GET', url: ROUTES.gateway.verify },
    { method: 'POST', url: ROUTES.gateway.analyses, body: AnalysisRequest },
    { method: 'GET', url: ROUTES.gateway.analysis },
    { method: 'GET', url: ROUTES.gateway.analysisMarkdown },
  ]);

  return app;
}
