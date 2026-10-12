export { buildApp, type AppOptions } from './app';
export { baseEnv, loadConfig } from './config';
export { HttpError } from './errors';
export { protectInternalRoutes, requireInternalToken } from './internal-auth';
export { REDACT_PATHS, createLogger, type Logger, type LoggerOptions } from './logger';
export { registerStubRoutes, type StubRoute } from './stub-routes';
export { startService, type StartOptions } from './start';
export { parseOrThrow, toDetails } from './validate';

// Services type their handlers with these without depending on fastify directly.
export type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
