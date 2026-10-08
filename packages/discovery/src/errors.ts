import type { ServiceName } from '@gyde/contracts';

/**
 * No healthy instance of a service is registered (doc 3.3: "no hay ninguna instancia saludable").
 * Callers must turn this into a controlled error or a degraded result; it must never block the
 * customer's pipeline.
 */
export class NoHealthyInstanceError extends Error {
  readonly serviceName: ServiceName;

  constructor(serviceName: ServiceName) {
    super(`No healthy instance of "${serviceName}" is registered`);
    this.name = 'NoHealthyInstanceError';
    this.serviceName = serviceName;
  }
}
