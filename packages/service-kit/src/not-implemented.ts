import { HttpError } from './errors';

/**
 * Body of a controller method that is part of the contract but not built yet: answers
 * `501 not_implemented`. The owner of the service replaces the call with a use case.
 *
 *   @Get(ROUTES.reports.getAnalysis)
 *   get(): never {
 *     return notImplemented('GET', ROUTES.reports.getAnalysis);
 *   }
 */
export function notImplemented(method: string, route: string): never {
  throw new HttpError('not_implemented', `${method} ${route} is not implemented yet`);
}
