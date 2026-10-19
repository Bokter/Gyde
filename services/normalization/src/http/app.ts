import { type Logger, type NestFastifyApplication, createService } from '@gyde/service-kit';

import { AppModule, type AppModuleOptions } from '../app.module';
import type { Config } from '../config';

export interface AppDeps extends AppModuleOptions {
  config: Config;
  logger: Logger;
}

/** Builds the NestJS application of the normalization service (not listening yet: see `main.ts`). */
export function createApp({
  config,
  logger,
  database,
  adapters,
}: AppDeps): Promise<NestFastifyApplication> {
  return createService(AppModule.register({ database, adapters }), {
    name: 'normalization',
    logger,
    config,
    internalToken: config.INTERNAL_SERVICE_TOKEN,
    // /readyz answers 503 while the database is unreachable.
    readiness: { database: () => database.ping() },
  });
}
