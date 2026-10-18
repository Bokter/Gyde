import type { DeregisterResultDto } from './dto/registry.dto';
import type { RegistryRepository } from './ports/registry-repository';

export const DEREGISTER_INSTANCE = Symbol('DeregisterInstance');

export class DeregisterInstance {
  constructor(private readonly repository: RegistryRepository) {}

  async execute(instanceId: string): Promise<DeregisterResultDto> {
    await this.repository.delete(instanceId);
    return { ok: true };
  }
}
