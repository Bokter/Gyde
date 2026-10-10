import { createLogger, loadConfig, startService } from '@gyde/service-kit';

import { configSchema } from './config';
import { createApp } from './http/app';

const config = loadConfig(configSchema);
const logger = createLogger({ name: 'llm-analysis', level: config.LOG_LEVEL });
const app = await createApp({ config, logger });

await startService(app, { port: config.LLM_ANALYSIS_PORT });
