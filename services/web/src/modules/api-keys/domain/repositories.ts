import type { ApiKey } from './entities';

export interface ApiKeyRepository {
  findByTenantId(tenantId: string): Promise<ApiKey[]>;
  findById(id: string): Promise<ApiKey | null>;
  findByKeyHash(keyHash: string): Promise<ApiKey | null>;
  create(apiKey: Omit<ApiKey, 'createdAt'>): Promise<ApiKey>;
  update(id: string, data: Partial<ApiKey>): Promise<ApiKey>;
  revoke(id: string): Promise<void>;
  updateLastUsedAt(id: string): Promise<void>;
}

export const API_KEY_REPOSITORY = Symbol('ApiKeyRepository');
