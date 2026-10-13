import type { FastifyInstance } from 'fastify';
import type { z } from 'zod';

import { HttpError } from './errors';
import { parseOrThrow } from './validate';

export interface StubRoute {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  /** Contract schema of the body: invalid payloads already get a real 400. */
  body?: z.ZodType;
}

/**
 * Registers the endpoints of a service as stubs that answer `501 not_implemented`.
 * The contract surface is visible (and the body is already validated) from day 1; the owner of
 * the service replaces each stub with a real handler that calls a use case.
 */
export function registerStubRoutes(app: FastifyInstance, routes: readonly StubRoute[]): void {
  for (const route of routes) {
    app.route({
      method: route.method,
      url: route.url,
      handler: async (request) => {
        if (route.body) {
          parseOrThrow(route.body, request.body);
        }
        throw new HttpError(
          'not_implemented',
          `${route.method} ${route.url} is not implemented yet`,
        );
      },
    });
  }
}
