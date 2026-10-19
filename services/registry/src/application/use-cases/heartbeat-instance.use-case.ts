import type { InstanceDto } from '../dto/registry.dto';
import { InstanceNotFoundError } from '../errors';
import type { RegistryRepository } from '../../domain/repositories/registry.repository';

export const HEARTBEAT_INSTANCE = Symbol('HeartbeatInstanceUseCase');

export class HeartbeatInstanceUseCase {
  constructor(
    private readonly repository: RegistryRepository,
    private readonly options: { now?: () => number } = {},
  ) {}

  async execute(instanceId: string): Promise<InstanceDto> {
    const instance = await this.repository.findById(instanceId);
    if (!instance) {
      throw new InstanceNotFoundError(instanceId);
    }

    const currentDate = this.options.now ? new Date(this.options.now()) : new Date();
    instance.touchHeartbeat(currentDate);
    await this.repository.save(instance);
    return instance.snapshot();
  }
}
