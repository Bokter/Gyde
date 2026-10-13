import { createLogger, loadConfig, startService } from '@gyde/service-kit';

import { configSchema } from './config';
import { createApp } from './http/app';

const config = loadConfig(configSchema);
const logger = createLogger({ name: 'gateway', level: config.LOG_LEVEL });
const app = createApp({ config, logger });

await startService(app, { port: config.GATEWAY_PORT });
