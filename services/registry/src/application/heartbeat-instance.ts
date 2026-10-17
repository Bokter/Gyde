import { HttpError } from '@gyde/service-kit';

import type { InstanceDto } from './dto/registry.dto';
import type { RegistryRepository } from './ports/registry-repository';

export const HEARTBEAT_INSTANCE = Symbol('HeartbeatInstance');

export class HeartbeatInstance {
  constructor(
    private readonly repository: RegistryRepository,
    private readonly options: { now?: () => number } = {},
  ) {}

  async execute(instanceId: string): Promise<InstanceDto> {
    const instance = await this.repository.findById(instanceId);
    if (!instance) {
      throw new HttpError('not_found', `Instance "${instanceId}" is not registered`);
    }

    const currentDate = this.options.now ? new Date(this.options.now()) : new Date();
    instance.touchHeartbeat(currentDate);
    await this.repository.save(instance);
    return instance.snapshot();
  }
}
