import type { ServiceName } from '@gyde/contracts';
import { NoHealthyInstanceError, type ServiceResolver } from '@gyde/discovery';

export interface ServiceLocatorOptions {
  /** The Service Registry client. Absent until it is wired (Area 1): only the static URLs are used. */
  resolver?: ServiceResolver;
  /** `*_URL` of the environment: the fallback when discovery cannot answer. */
  staticUrls: Partial<Record<ServiceName, string>>;
}

/**
 * Where a service lives. Discovery first (a healthy instance, balanced); the static URL of the
 * environment only as a fallback, so nothing is hardcoded and development works without a registry.
 */
export class ServiceLocator {
  constructor(private readonly options: ServiceLocatorOptions) {}

  /** @throws NoHealthyInstanceError when neither discovery nor a static URL can answer. */
  async baseUrl(service: ServiceName): Promise<string> {
    if (this.options.resolver) {
      try {
        return (await this.options.resolver.pick(service)).baseUrl;
      } catch {
        // Registry unreachable or no healthy instance: try the static URL below.
      }
    }
    const fallback = this.options.staticUrls[service];
    if (fallback) return fallback;
    throw new NoHealthyInstanceError(service);
  }
}
