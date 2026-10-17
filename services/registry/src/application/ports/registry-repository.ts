import type { ServiceInstance, ServiceName } from '../../domain/service-instance';

export const REGISTRY_REPOSITORY = Symbol('RegistryRepository');

export interface RegistryRepository {
  save(instance: ServiceInstance): Promise<void>;
  findById(instanceId: string): Promise<ServiceInstance | null>;
  findByServiceName(serviceName: ServiceName): Promise<ServiceInstance[]>;
  findAll(): Promise<ServiceInstance[]>;
  delete(instanceId: string): Promise<boolean>;
  deleteExpired(ttlMs: number, now?: number): Promise<string[]>;
}
