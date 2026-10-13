import { timingSafeEqual } from 'node:crypto';

import { HEADERS } from '@gyde/contracts';
import type { FastifyRequest } from 'fastify';

import { HttpError } from './errors';

/**
 * Checks the `x-internal-token` header of a service-to-service call (constant-time comparison).
 * Throws a 401 `HttpError` when it is missing or wrong.
 */
export function requireInternalToken(expected: string) {
  const expectedBytes = Buffer.from(expected);

  return async function internalAuth(request: Pick<FastifyRequest, 'headers'>): Promise<void> {
    const header = request.headers[HEADERS.internalToken];
    const provided = Array.isArray(header) ? header[0] : header;
    if (!provided) {
      throw new HttpError('unauthorized', 'Missing internal token');
    }
    const providedBytes = Buffer.from(provided);
    // The length check is required by timingSafeEqual.
    if (
      providedBytes.length !== expectedBytes.length ||
      !timingSafeEqual(providedBytes, expectedBytes)
    ) {
      throw new HttpError('unauthorized', 'Invalid internal token');
    }
  };
}

/**
 * Fastify `onRequest` hook that requires the internal token on EVERY request whose path starts
 * with one of `prefixes`, including paths that do not exist, so a forgotten per-route guard cannot
 * leave an endpoint open. `createService` installs it when you pass `internalToken`.
 * The gateway never routes `/internal/*`, so this is a second line of defense, not the only one.
 */
export function internalTokenHook(expected: string, prefixes: readonly string[]) {
  const guard = requireInternalToken(expected);
  return async function protectInternal(request: FastifyRequest): Promise<void> {
    const path = request.url.split('?')[0] ?? '';
    if (prefixes.some((prefix) => path.startsWith(prefix))) {
      await guard(request);
    }
  };
}
