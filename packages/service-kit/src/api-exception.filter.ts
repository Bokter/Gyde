import { type ApiError, type ErrorCode } from '@gyde/contracts';
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { HttpError } from './errors';
import { toDetails } from './validate';

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
 * The single place where every error becomes the standard `ApiError` envelope. Registered
 * globally by `createService`: services throw `HttpError` (or let a zod error escape) and never
 * format an error response by hand.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const send = (status: number, body: ApiError): void => {
      void reply.status(status).send(body);
    };

    if (exception instanceof HttpError) {
      return send(
        exception.status,
        envelope(exception.code, exception.message, request.id, exception.details),
      );
    }
    if (exception instanceof ZodError) {
      return send(
        400,
        envelope('invalid_request', 'Request validation failed', request.id, toDetails(exception)),
      );
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === 404) {
        // Path only: the query string may carry secrets, and Nest's own message echoes it.
        const path = request.url.split('?')[0];
        return send(
          404,
          envelope('not_found', `Route ${request.method} ${path} not found`, request.id),
        );
      }
      return send(
        status,
        envelope(CODE_BY_STATUS[status] ?? 'invalid_request', exception.message, request.id),
      );
    }
    // Errors raised by Fastify itself (malformed JSON, unsupported media type, body too large…).
    const statusCode = (exception as { statusCode?: number } | null)?.statusCode;
    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
      const message = exception instanceof Error ? exception.message : 'Bad request';
      return send(
        statusCode,
        envelope(CODE_BY_STATUS[statusCode] ?? 'invalid_request', message, request.id),
      );
    }
    // Anything else is a bug: log it, but never leak internals to the caller.
    request.log.error({ err: exception }, 'unhandled error');
    return send(500, envelope('internal', 'Internal server error', request.id));
  }
}
