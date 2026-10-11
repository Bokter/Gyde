import { HttpError } from '@gyde/service-kit';

/**
 * The service cannot be reached or failed on its side: no healthy instance, the circuit is open,
 * the call timed out, the network failed or it answered 5xx. The caller decides what degrades.
 */
export class ServiceUnavailableError extends Error {
  constructor(
    readonly service: string,
    reason: string,
  ) {
    super(`${service} is unavailable: ${reason}`);
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Sorts what `ResilientHttpClient` throws. A 4xx arrives as `HttpError`: the service is alive and
 * refused the request (a bug on our side), so it is returned untouched and never retried or
 * counted as an outage. Anything else is an outage.
 */
export function toUnavailable(service: string, error: unknown): Error {
  if (error instanceof HttpError) return error;
  const reason = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
  return new ServiceUnavailableError(service, reason.slice(0, 200));
}
