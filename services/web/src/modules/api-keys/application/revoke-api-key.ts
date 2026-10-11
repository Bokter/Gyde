import type { ApiKeyRepository } from '../domain/repositories';

export class RevokeApiKey {
  constructor(private readonly apiKeyRepository: ApiKeyRepository) {}

  async execute(apiKeyId: string, tenantId: string): Promise<void> {
    const apiKey = await this.apiKeyRepository.findById(apiKeyId);
    if (!apiKey || apiKey.tenantId !== tenantId) {
      throw new Error('NOT_FOUND');
    }
    if (apiKey.revokedAt) {
      throw new Error('ALREADY_REVOKED');
    }
    await this.apiKeyRepository.revoke(apiKeyId);
  }
}
