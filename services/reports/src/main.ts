import { createLogger, loadConfig, startService } from '@gyde/service-kit';

import { configSchema } from './config';
import { createApp } from './http/app';
import { connectPostgres } from './infrastructure/db/database';

const config = loadConfig(configSchema);
const logger = createLogger({ name: 'reports', level: config.LOG_LEVEL });

// Optional by design: without the URL Reports runs in memory (development and tests).
const database = config.REPORTS_DATABASE_URL
  ? // A connection cut by the database must not kill the service: the pool reconnects by itself.
    connectPostgres(config.REPORTS_DATABASE_URL, (error) =>
      logger.warn({ code: (error as { code?: string }).code }, 'A PostgreSQL connection was lost'),
    )
  : undefined;

const app = await createApp({ config, logger, database });

await startService(app, { port: config.REPORTS_PORT });
