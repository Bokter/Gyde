import { timingSafeEqual } from 'node:crypto';

import { HEADERS } from '@gyde/contracts';
import type { FastifyRequest } from 'fastify';

import { HttpError } from './errors';

/**
 * Guard for `/internal/*` routes: service-to-service calls must carry INTERNAL_SERVICE_TOKEN.
 * The gateway never routes `/internal/*`, so this is a second line of defense, not the only one.
 *
 *   app.addHook('onRequest', requireInternalToken(config.INTERNAL_SERVICE_TOKEN));
 */
export function requireInternalToken(expected: string) {
  const expectedBytes = Buffer.from(expected);

  return async function internalAuth(request: FastifyRequest): Promise<void> {
    const header = request.headers[HEADERS.internalToken];
    const provided = Array.isArray(header) ? header[0] : header;
    if (!provided) {
      throw new HttpError('unauthorized', 'Missing internal token');
    }
    const providedBytes = Buffer.from(provided);
    // Constant-time comparison; the length check is required by timingSafeEqual.
    if (
      providedBytes.length !== expectedBytes.length ||
      !timingSafeEqual(providedBytes, expectedBytes)
    ) {
      throw new HttpError('unauthorized', 'Invalid internal token');
    }
  };
}
