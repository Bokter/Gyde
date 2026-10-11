import type { ServiceName } from '@gyde/contracts';
import { NoHealthyInstanceError, RegistryClient, type ServiceResolver } from '@gyde/discovery';

import type { Config } from '../config';

/**
 * Where normalization, reports and llm-analysis live. With a Service Registry configured,
 * discovery answers (and the client falls back to the static `*_URL` of the environment when it
 * cannot). Without a registry, every lookup fails as "no healthy instance" so the HTTP client uses
 * the same static URLs: nothing is hardcoded.
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
  return {
    normalization: config.NORMALIZATION_URL,
    'llm-analysis': config.LLM_ANALYSIS_URL,
    reports: config.REPORTS_URL,
  };
}
