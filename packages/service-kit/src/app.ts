import { randomUUID } from 'node:crypto';

import { type ApiError, type ErrorCode, HEADERS } from '@gyde/contracts';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { HttpError } from './errors';
import type { Logger } from './logger';
import { toDetails } from './validate';

export interface AppOptions {
  /** Service name, e.g. "gateway". Shown in health checks and logs. */
  name: string;
  version?: string;
  logger: Logger;
  /** Readiness checks (database, registry…): `/readyz` answers 503 while any of them fails. */
  readiness?: Record<string, () => Promise<unknown>>;
  /** Max request body in bytes. Defaults to 1 MiB (an AnalysisRequest is far below that). */
  bodyLimit?: number;
}

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: 'invalid_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  429: 'rate_limited',
};

function envelope(
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: unknown,
): ApiError {
  return {
    error: { code, message, requestId, ...(details === undefined ? {} : { details }) },
  };
}

/**
 * Builds the Fastify instance every Gyde service starts from:
 * request ids, standard error envelope, `/healthz` (liveness) and `/readyz` (readiness).
 * Register routes on the returned instance, then call `startService`.
 */
export function buildApp(options: AppOptions): FastifyInstance {
  const { name, version = '0.0.0', logger, readiness = {}, bodyLimit = 1_048_576 } = options;
  const startedAt = Date.now();
  // Typing the logger as FastifyBaseLogger keeps the returned instance a plain FastifyInstance.
  const baseLogger: FastifyBaseLogger = logger;

  const app = Fastify({
    loggerInstance: baseLogger,
    requestIdHeader: HEADERS.requestId,
    genReqId: () => randomUUID(),
    bodyLimit,
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header(HEADERS.requestId, request.id);
  });

  app.setNotFoundHandler(async (request, reply) => {
    // Path only: the query string may carry secrets.
    const path = request.url.split('?')[0];
    return reply
      .status(404)
      .send(envelope('not_found', `Route ${request.method} ${path} not found`, request.id));
  });

  app.setErrorHandler(async (error: Error, request, reply) => {
    if (error instanceof HttpError) {
      return reply
        .status(error.status)
        .send(envelope(error.code, error.message, request.id, error.details));
    }
    if (error instanceof ZodError) {
      return reply
        .status(400)
        .send(
          envelope('invalid_request', 'Request validation failed', request.id, toDetails(error)),
        );
    }
    // Errors raised by Fastify itself (malformed JSON, unsupported media type, body too large…).
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
      const code = CODE_BY_STATUS[statusCode] ?? 'invalid_request';
      return reply.status(statusCode).send(envelope(code, error.message, request.id));
    }
    // Anything else is a bug: log it, but never leak internals to the caller.
    request.log.error({ err: error }, 'unhandled error');
    return reply.status(500).send(envelope('internal', 'Internal server error', request.id));
  });

  app.get('/healthz', async () => ({
    status: 'ok',
    service: name,
    version,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  }));

  app.get('/readyz', async (_request, reply) => {
    const checks: Record<string, 'ok' | 'failed'> = {};
    await Promise.all(
      Object.entries(readiness).map(async ([check, run]) => {
        try {
          await run();
          checks[check] = 'ok';
        } catch {
          checks[check] = 'failed';
        }
      }),
    );
    const ready = Object.values(checks).every((result) => result === 'ok');
    return reply
      .status(ready ? 200 : 503)
      .send({ status: ready ? 'ready' : 'not_ready', service: name, checks });
  });

  return app;
}
