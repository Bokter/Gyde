import { Injectable } from '@nestjs/common';

import type { RegistryRepository } from '../application/ports/registry-repository';
import type { ServiceInstance, ServiceName } from '../domain/service-instance';

@Injectable()
export class InMemoryRegistryRepository implements RegistryRepository {
  private readonly instances = new Map<string, ServiceInstance>();

  async save(instance: ServiceInstance): Promise<void> {
    this.instances.set(instance.instanceId, instance);
  }

  async findById(instanceId: string): Promise<ServiceInstance | null> {
    return this.instances.get(instanceId) ?? null;
  }

  async findByServiceName(serviceName: ServiceName): Promise<ServiceInstance[]> {
    return Array.from(this.instances.values()).filter((inst) => inst.serviceName === serviceName);
  }

  async findAll(): Promise<ServiceInstance[]> {
    return Array.from(this.instances.values());
  }

  async delete(instanceId: string): Promise<boolean> {
    return this.instances.delete(instanceId);
  }

  async deleteExpired(ttlMs: number, now = Date.now()): Promise<string[]> {
    const expiredIds: string[] = [];
    for (const [id, instance] of this.instances.entries()) {
      if (instance.isExpired(ttlMs, now)) {
        expiredIds.push(id);
        this.instances.delete(id);
      }
    }
    return expiredIds;
  }
}
