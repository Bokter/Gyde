import { ServiceInstance } from '../../domain/entities/service-instance.entity';
import type { InstanceDto, RegisterInstanceDto } from '../dto/registry.dto';
import type { RegistryRepository } from '../../domain/repositories/registry.repository';

export const REGISTER_INSTANCE = Symbol('RegisterInstanceUseCase');

export class RegisterInstanceUseCase {
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
