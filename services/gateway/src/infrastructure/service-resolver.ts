import type { ServiceName } from '@gyde/contracts';
import { NoHealthyInstanceError, RegistryClient, type ServiceResolver } from '@gyde/discovery';

import type { Config } from '../config';

/**
 * Where web and reports live. With a Service Registry configured, discovery answers (and falls
 * back to the static `*_URL` of the environment when it cannot). Without one, every lookup fails
 * as "no healthy instance" so the HTTP client uses those same static URLs.
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

export function staticUrls(config: Config): Partial<Record<ServiceName, string>> {
  return { web: config.WEB_URL, reports: config.REPORTS_URL };
}
