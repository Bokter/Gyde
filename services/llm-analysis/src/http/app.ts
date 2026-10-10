import { type Logger, type NestFastifyApplication, createService } from '@gyde/service-kit';

import { AppModule } from '../app.module';
import type { Config } from '../config';

export interface AppDeps {
  config: Config;
  logger: Logger;
}

/** Builds the NestJS application of the llm-analysis service (not listening yet: see `main.ts`). */
export function createApp({ config, logger }: AppDeps): Promise<NestFastifyApplication> {
  return createService(AppModule, {
    name: 'llm-analysis',
    logger,
    config,
    internalToken: config.INTERNAL_SERVICE_TOKEN,
  });
}
