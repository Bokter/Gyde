import type { ResolveResultDto, ResolveServiceDto } from '../dto/registry.dto';
import type { RegistryRepository } from '../../domain/repositories/registry.repository';

export const RESOLVE_SERVICE_INSTANCES = Symbol('ResolveServiceInstancesUseCase');

export class ResolveServiceInstancesUseCase {
  constructor(
    private readonly repository: RegistryRepository,
    private readonly options: { instanceTtlMs: number; now?: () => number },
  ) {}

  async execute({ serviceName }: ResolveServiceDto): Promise<ResolveResultDto> {
    const all = await this.repository.findByServiceName(serviceName);
    const now = this.options.now ? this.options.now() : Date.now();

    const healthyInstances = all
      .filter((inst) => inst.healthy && !inst.isExpired(this.options.instanceTtlMs, now))
      .map((inst) => inst.snapshot());

    return {
      serviceName,
      instances: healthyInstances,
    };
  }
}
