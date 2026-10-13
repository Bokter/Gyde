import { HttpError } from '@gyde/service-kit';
import { Logger } from '@nestjs/common';

const logger = new Logger('Upstream');

/**
 * Whatever goes wrong talking to a neighbour (no instance, open circuit, 5xx, timeout, network
 * error, an unexpected answer) reaches the client as one generic 503. The detail goes to the log;
 * service names and response bodies never leave the gateway.
 */
export function toUpstreamUnavailable(target: string, error: unknown): HttpError {
  const reason = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
  logger.warn(`${target} call failed: ${reason}`);
  return new HttpError('upstream_unavailable', 'The service is temporarily unavailable');
}
