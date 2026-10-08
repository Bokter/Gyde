import type { InstanceInfo, ServiceName, ServiceRegistration } from '@gyde/contracts';

/**
 * SERVICE DISCOVERY client (architecture doc, "Patrón arquitectónico 2").
 *
 * Instances come and go with autoscaling, so nobody hardcodes an address: services register
 * themselves, the gateway asks the registry for a healthy instance before each call.
 *
 * TODO(area-1): implement. Acceptance criteria: docs/tasks/area-1-plataforma-y-borde.md and the
 * pending specs in test/registry-client.test.ts.
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
}

export class RegistryClient implements ServiceResolver {
  readonly options: RegistryClientOptions;

  constructor(options: RegistryClientOptions) {
    this.options = options;
  }

  async register(_registration: ServiceRegistration): Promise<void> {
    throw new Error('TODO(area-1): RegistryClient.register is not implemented yet');
  }

  async heartbeat(_instanceId: string): Promise<void> {
    throw new Error('TODO(area-1): RegistryClient.heartbeat is not implemented yet');
  }

  async deregister(_instanceId: string): Promise<void> {
    throw new Error('TODO(area-1): RegistryClient.deregister is not implemented yet');
  }

  async resolve(_serviceName: ServiceName): Promise<InstanceInfo[]> {
    throw new Error('TODO(area-1): RegistryClient.resolve is not implemented yet');
  }

  async pick(_serviceName: ServiceName): Promise<InstanceInfo> {
    throw new Error('TODO(area-1): RegistryClient.pick is not implemented yet');
  }
}
