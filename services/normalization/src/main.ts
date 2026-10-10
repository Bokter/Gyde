import { createLogger, loadConfig, startService } from '@gyde/service-kit';

import { configSchema } from './config';
import { createApp } from './http/app';
import { connectPostgres } from './infrastructure/db/database';

const config = loadConfig(configSchema);
const logger = createLogger({ name: 'normalization', level: config.LOG_LEVEL });

if (!config.NORMALIZATION_DATABASE_URL) {
  throw new Error('NORMALIZATION_DATABASE_URL is required to start the service');
}
const database = connectPostgres(config.NORMALIZATION_DATABASE_URL);
const app = await createApp({ config, logger, database });

await startService(app, { port: config.NORMALIZATION_PORT });
