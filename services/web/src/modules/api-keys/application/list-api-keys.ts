import type { ApiKey } from '../domain/entities';
import type { ApiKeyRepository } from '../domain/repositories';

export class ListApiKeys {
  constructor(private readonly apiKeyRepository: ApiKeyRepository) {}

  async execute(tenantId: string): Promise<ApiKey[]> {
    return this.apiKeyRepository.findByTenantId(tenantId);
  }
}
