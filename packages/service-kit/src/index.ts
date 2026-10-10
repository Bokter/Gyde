export { createService, type ServiceOptions } from './bootstrap';
export { baseEnv, loadConfig } from './config';
export { HttpError } from './errors';
export { requireInternalToken } from './internal-auth';
export { REDACT_PATHS, createLogger, type Logger, type LoggerOptions } from './logger';
export { notImplemented } from './not-implemented';
export { startService, type StartOptions } from './start';
export { APP_CONFIG } from './tokens';
export { parseOrThrow, toDetails } from './validate';
export { ZodValidationPipe } from './zod-pipe';

// Services type their entry points with this without depending on @nestjs/platform-fastify.
export type { NestFastifyApplication } from '@nestjs/platform-fastify';
