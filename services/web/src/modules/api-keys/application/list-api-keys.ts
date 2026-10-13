import type { ApiKey } from '../domain/entities';
import type { ApiKeyRepository } from '../domain/repositories';
import type { TenantRepository } from '@/modules/auth/application/ports/tenant-repository';

export class ListApiKeys {
  constructor(
    private readonly apiKeyRepository: ApiKeyRepository,
    private readonly tenantRepository: TenantRepository,
  ) {}

  async execute(tenantId: string): Promise<ApiKey[]> {
    return this.apiKeyRepository.findByTenantId(tenantId);
  }

  async getTenantByOwnerId(ownerId: string) {
    return this.tenantRepository.findByOwnerId(ownerId);
  }
}
