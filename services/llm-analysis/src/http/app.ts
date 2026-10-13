import { type Logger, type NestFastifyApplication, createService } from '@gyde/service-kit';

import { AppModule, type AppModuleOverrides } from '../app.module';
import type { Config } from '../config';

export interface AppDeps {
  config: Config;
  logger: Logger;
  /** Test seams: see `AppModuleOverrides`. */
  module?: AppModuleOverrides;
}

/** Builds the NestJS application of the llm-analysis service (not listening yet: see `main.ts`). */
export function createApp({ config, logger, module }: AppDeps): Promise<NestFastifyApplication> {
  return createService(AppModule.register(module), {
    name: 'llm-analysis',
    logger,
    config,
    internalToken: config.INTERNAL_SERVICE_TOKEN,
  });
}
