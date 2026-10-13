import type { ServiceName } from '@gyde/contracts';
import { NoHealthyInstanceError, RegistryClient, type ServiceResolver } from '@gyde/discovery';

import type { Config } from '../config';

/**
 * Where Retrieval lives. With a Service Registry configured, discovery answers (and the client
 * falls back to the static `RETRIEVAL_URL` when it cannot). Without a registry, every lookup fails
 * as "no healthy instance" so the HTTP client uses that same static URL: nothing is hardcoded.
 */
export function createServiceResolver(config: Config): ServiceResolver {
  if (config.REGISTRY_URL) {
    return new RegistryClient({
      registryUrl: config.REGISTRY_URL,
      internalToken: config.INTERNAL_SERVICE_TOKEN,
      staticUrls: staticUrls(config),
    });
  }

  return {
    resolve: async () => [],
    pick: async (serviceName: ServiceName) => {
      throw new NoHealthyInstanceError(serviceName);
    },
  };
}

/** Local development: Retrieval on its default port when the environment says nothing else. */
export const DEFAULT_RETRIEVAL_URL = 'http://localhost:4300';

export function staticUrls(config: Config): Partial<Record<ServiceName, string>> {
  return { retrieval: config.RETRIEVAL_URL ?? DEFAULT_RETRIEVAL_URL };
}
