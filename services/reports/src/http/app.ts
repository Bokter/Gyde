import { type Logger, type NestFastifyApplication, createService } from '@gyde/service-kit';

import { AppModule, type AppModuleOverrides } from '../app.module';
import type { Config } from '../config';

export interface AppDeps {
  config: Config;
  logger: Logger;
  /** Test-only: replace the default adapters (repository, retrieval) with fakes. */
  overrides?: AppModuleOverrides;
}

/** Builds the NestJS application of the reports service (not listening yet: see `main.ts`). */
export function createApp({
  config,
  logger,
  overrides = {},
}: AppDeps): Promise<NestFastifyApplication> {
  return createService(AppModule.withOverrides(overrides), {
    name: 'reports',
    logger,
    config,
    internalToken: config.INTERNAL_SERVICE_TOKEN,
  });
}
