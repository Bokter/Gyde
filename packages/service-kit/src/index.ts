export { createService, type ServiceOptions } from './bootstrap';
export { baseEnv, loadConfig } from './config';
export { HttpError } from './errors';
export { requireInternalToken } from './internal-auth';
export { REDACT_PATHS, createLogger, type Logger, type LoggerOptions } from './logger';
export { notImplemented } from './not-implemented';
export {
  ResilientHttpClient,
  type ResilientHttpClientOptions,
  type ResilientRequestOptions,
  type UpstreamLogger,
  UpstreamServiceError,
} from './resilient-http-client';
export { startService, type StartOptions, type ServiceRegistrationOptions } from './start';
export { APP_CONFIG, SERVICE_METADATA } from './tokens';
export { parseOrThrow, toDetails } from './validate';
export { ZodValidationPipe } from './zod-pipe';

// Re-export common discovery and resilience errors so callers can handle them directly
export { NoHealthyInstanceError } from '@gyde/discovery';
export { CircuitOpenError } from '@gyde/resilience';

// Services type their entry points with this without depending on @nestjs/platform-fastify.
export type { NestFastifyApplication } from '@nestjs/platform-fastify';
