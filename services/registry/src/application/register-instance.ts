import { ServiceInstance } from '../domain/service-instance';
import type { InstanceDto, RegisterInstanceDto } from './dto/registry.dto';
import type { RegistryRepository } from './ports/registry-repository';

export const REGISTER_INSTANCE = Symbol('RegisterInstance');

export class RegisterInstance {
  constructor(
    private readonly repository: RegistryRepository,
    private readonly options: { now?: () => number } = {},
  ) {}

  async execute(registration: RegisterInstanceDto): Promise<InstanceDto> {
    const currentDate = this.options.now ? new Date(this.options.now()) : new Date();
    const instance = ServiceInstance.create(registration, currentDate);
    await this.repository.save(instance);
    return instance.snapshot();
  }
}
