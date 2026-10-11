import type { InstanceInfo, ResolveResponse, ServiceName } from '@gyde/contracts';

import type { RegistryRepository } from './ports/registry-repository';

export const RESOLVE_SERVICE_INSTANCES = Symbol('ResolveServiceInstances');

export class ResolveServiceInstances {
  constructor(
    private readonly repository: RegistryRepository,
    private readonly options: { instanceTtlMs: number; now?: () => number },
  ) {}

  async execute(serviceName: ServiceName): Promise<ResolveResponse> {
    const all = await this.repository.findByServiceName(serviceName);
    const now = this.options.now ? this.options.now() : Date.now();

    const healthyInstances: InstanceInfo[] = all
      .filter((inst) => inst.healthy && !inst.isExpired(this.options.instanceTtlMs, now))
      .map((inst) => inst.toContract());

    return {
      serviceName,
      instances: healthyInstances,
    };
  }
}
