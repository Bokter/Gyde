import type { ApiKeyRepository } from '../domain/repositories';

export class RevokeApiKey {
  constructor(private readonly apiKeyRepository: ApiKeyRepository) {}

  async execute(apiKeyId: string, tenantId: string): Promise<void> {
    const apiKey = await this.apiKeyRepository.findById(apiKeyId);
    if (!apiKey) {
      throw new Error('API key not found');
    }
    if (apiKey.tenantId !== tenantId) {
      throw new Error('API key does not belong to tenant');
    }
    if (apiKey.revokedAt) {
      throw new Error('API key already revoked');
    }
    await this.apiKeyRepository.revoke(apiKeyId);
  }
}
