import { type Logger, type NestFastifyApplication, createService } from '@gyde/service-kit';

import { AppModule, type AppModuleOptions } from '../app.module';
import type { Config } from '../config';

export interface AppDeps {
  config: Config;
  logger: Logger;
  /** Test seam: see `AppModuleOptions`. */
  module?: AppModuleOptions;
}

/** Builds the NestJS application of the normalization service (not listening yet: see `main.ts`). */
export function createApp({ config, logger, module }: AppDeps): Promise<NestFastifyApplication> {
  return createService(AppModule.register(module), {
    name: 'normalization',
    logger,
    config,
    internalToken: config.INTERNAL_SERVICE_TOKEN,
  });
}
