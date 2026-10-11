import type { Tenant } from '@/modules/billing/domain/entities';

export interface TenantRepository {
  findByOwnerId(ownerId: string): Promise<Tenant | null>;
  findById(id: string): Promise<Tenant | null>;
  create(tenant: Omit<Tenant, 'id' | 'createdAt' | 'updatedAt'>): Promise<Tenant>;
  update(id: string, data: Partial<Tenant>): Promise<Tenant>;
}

export const TENANT_REPOSITORY = Symbol('TenantRepository');
