import type { InstanceInfo, ServiceRegistration } from '@gyde/contracts';

import { ServiceInstance } from '../domain/service-instance';
import type { RegistryRepository } from './ports/registry-repository';

export const REGISTER_INSTANCE = Symbol('RegisterInstance');

export class RegisterInstance {
  constructor(
    private readonly repository: RegistryRepository,
    private readonly options: { now?: () => number } = {},
  ) {}

  async execute(registration: ServiceRegistration): Promise<InstanceInfo> {
    const currentDate = this.options.now ? new Date(this.options.now()) : new Date();
    const instance = ServiceInstance.fromRegistration(registration, currentDate);
    await this.repository.save(instance);
    return instance.toContract();
  }
}
