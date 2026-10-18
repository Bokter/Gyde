import type { DeregisterResultDto } from '../dto/registry.dto';
import type { RegistryRepository } from '../../domain/repositories/registry.repository';

export const DEREGISTER_INSTANCE = Symbol('DeregisterInstanceUseCase');

export class DeregisterInstanceUseCase {
  constructor(private readonly repository: RegistryRepository) {}

  async execute(instanceId: string): Promise<DeregisterResultDto> {
    await this.repository.delete(instanceId);
    return { ok: true };
  }
}
