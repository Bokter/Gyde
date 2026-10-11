import {
  buildPath,
  HEADERS,
  type InstanceInfo,
  ResolveResponse,
  ROUTES,
  type ServiceName,
  type ServiceRegistration,
} from '@gyde/contracts';

import { NoHealthyInstanceError } from './errors';

/**
 * SERVICE DISCOVERY client (architecture doc, "Patrón arquitectónico 2").
 *
 * Instances come and go with autoscaling, so nobody hardcodes an address: services register
 * themselves, the gateway asks the registry for a healthy instance before each call.
 */

export interface ServiceResolver {
  /** Healthy instances currently known for a service. */
  resolve(serviceName: ServiceName): Promise<InstanceInfo[]>;
  /** One healthy instance, balanced round-robin. Throws NoHealthyInstanceError when none. */
  pick(serviceName: ServiceName): Promise<InstanceInfo>;
}

export interface RegistryClientOptions {
  /** e.g. REGISTRY_URL=http://registry:4100 */
  registryUrl: string;
  /** INTERNAL_SERVICE_TOKEN: the registry only accepts registrations from our own services. */
  internalToken: string;
  /** Injectable for tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** How long `resolve` results are reused to avoid a registry round trip per request. */
  resolveCacheTtlMs?: number;
  /**
   * Static base URLs used when the registry is unreachable (local development, or the registry
   * itself being down). Example: `{ reports: 'http://reports:4500' }`.
   */
  staticUrls?: Partial<Record<ServiceName, string>>;
  /** Receives the reason why `resolve` fell back (registry unreachable, bad status or shape). */
  logger?: DiscoveryLogger;
}

/** The slice of the pino logger the client needs. */
export interface DiscoveryLogger {
  warn(obj: Record<string, unknown>, msg?: string): void;
}

interface CacheEntry {
  instances: InstanceInfo[];
  fetchedAt: number;
}

export class RegistryClient implements ServiceResolver {
  readonly options: RegistryClientOptions;
  private readonly resolveCache = new Map<ServiceName, CacheEntry>();
  private readonly roundRobinIndices = new Map<ServiceName, number>();

  constructor(options: RegistryClientOptions) {
    this.options = options;
  }

  private get fetchFn(): typeof fetch {
    return this.options.fetch ?? globalThis.fetch;
  }

  /** Headers of every call. `Content-Type` is added only where there is a body (see `jsonHeaders`). */
  private get defaultHeaders(): Record<string, string> {
    return { [HEADERS.internalToken]: this.options.internalToken };
  }

  /** Fastify answers 400 to a `Content-Type: application/json` request with an empty body. */
  private get jsonHeaders(): Record<string, string> {
    return { ...this.defaultHeaders, 'Content-Type': 'application/json' };
  }

  async register(registration: ServiceRegistration): Promise<void> {
    const url = `${this.options.registryUrl}${ROUTES.registry.instances}`;
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: this.jsonHeaders,
      body: JSON.stringify(registration),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Registry registration failed (${res.status}): ${text}`);
    }
  }

  async heartbeat(instanceId: string): Promise<void> {
    const path = buildPath(ROUTES.registry.heartbeat, { instanceId });
    const url = `${this.options.registryUrl}${path}`;
    const res = await this.fetchFn(url, {
      method: 'PUT',
      headers: this.defaultHeaders,
    });

    if (res.status === 404) {
      throw new Error(`Instance "${instanceId}" not found in registry`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Registry heartbeat failed (${res.status}): ${text}`);
    }
  }

  async deregister(instanceId: string): Promise<void> {
    const path = buildPath(ROUTES.registry.instance, { instanceId });
    const url = `${this.options.registryUrl}${path}`;
    const res = await this.fetchFn(url, {
      method: 'DELETE',
      headers: this.defaultHeaders,
    });

    if (!res.ok && res.status !== 404) {
      const text = await res.text().catch(() => '');
      throw new Error(`Registry deregistration failed (${res.status}): ${text}`);
    }
  }

  async resolve(serviceName: ServiceName): Promise<InstanceInfo[]> {
    const ttl = this.options.resolveCacheTtlMs ?? 5000;
    const cached = this.resolveCache.get(serviceName);
    const now = Date.now();

    if (cached && now - cached.fetchedAt < ttl) {
      return cached.instances;
    }

    const path = buildPath(ROUTES.registry.resolve, { serviceName });
    const url = `${this.options.registryUrl}${path}`;

    try {
      const res = await this.fetchFn(url, {
        method: 'GET',
        headers: this.defaultHeaders,
      });

      if (res.ok) {
        // The registry answers `ResolveResponse`, not a bare array, and lists only healthy instances.
        const { instances } = ResolveResponse.parse(await res.json());
        this.resolveCache.set(serviceName, { instances, fetchedAt: now });
        return instances;
      }
      this.options.logger?.warn(
        { serviceName, status: res.status },
        'registry resolve failed, using the fallback',
      );
    } catch (error) {
      this.options.logger?.warn(
        { serviceName, err: error instanceof Error ? error.message : String(error) },
        'registry resolve failed, using the fallback',
      );
    }

    // Fallback 1: return static URL if available in options.staticUrls
    const staticUrl = this.options.staticUrls?.[serviceName];
    if (staticUrl) {
      const isoNow = new Date(now).toISOString();
      const staticInstance: InstanceInfo = {
        instanceId: `static-${serviceName}`,
        serviceName,
        baseUrl: staticUrl,
        version: '0.0.0',
        healthy: true,
        registeredAt: isoNow,
        lastHeartbeatAt: isoNow,
      };
      return [staticInstance];
    }

    // Fallback 2: return stale cached instance if available
    if (cached) {
      return cached.instances;
    }

    return [];
  }

  async pick(serviceName: ServiceName): Promise<InstanceInfo> {
    const instances = await this.resolve(serviceName);
    // The registry lists healthy instances only, so there is nothing left to filter.
    const healthy = instances;

    if (healthy.length === 0) {
      throw new NoHealthyInstanceError(serviceName);
    }

    const currentIndex = this.roundRobinIndices.get(serviceName) ?? 0;
    const picked = healthy[currentIndex % healthy.length];
    this.roundRobinIndices.set(serviceName, currentIndex + 1);

    if (!picked) {
      throw new NoHealthyInstanceError(serviceName);
    }

    return picked;
  }
}
