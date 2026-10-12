import { type Logger, type NestFastifyApplication, createService } from '@gyde/service-kit';

import { AppModule, type AppModuleOptions } from '../app.module';
import type { Config } from '../config';

export interface AppDeps {
  config: Config;
  logger: Logger;
  /** Test seams: see `AppModuleOptions`. */
  module?: Omit<AppModuleOptions, 'logger'>;
}

/** Builds the NestJS application of the gateway service (not listening yet: see `main.ts`). */
export function createApp({ config, logger, module }: AppDeps): Promise<NestFastifyApplication> {
  return createService(AppModule.register({ ...module, logger }), {
    name: 'gateway',
    logger,
    config,
  });
}
