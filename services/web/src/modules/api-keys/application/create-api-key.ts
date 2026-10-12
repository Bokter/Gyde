import type { ApiKey } from '../domain/entities';
import type { ApiKeyRepository } from '../domain/repositories';
import { generateApiKey } from './generate-api-key';

export interface CreateApiKeyInput {
  tenantId: string;
  name: string | null;
  environment: 'live' | 'test';
  expiresAt: Date | null;
}

export interface CreateApiKeyOutput {
  apiKey: ApiKey;
  plainKey: string; // Only returned once
}

export class CreateApiKey {
  constructor(private readonly apiKeyRepository: ApiKeyRepository) {}

  async execute(input: CreateApiKeyInput): Promise<CreateApiKeyOutput> {
    const { prefix, plainKey, keyHash, keyLast4 } = await generateApiKey(input.environment);

    const apiKey = await this.apiKeyRepository.create({
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      prefix,
      keyHash,
      keyLast4,
      name: input.name,
      environment: input.environment,
      expiresAt: input.expiresAt,
      revokedAt: null,
      lastUsedAt: null,
    });

    return { apiKey, plainKey };
  }
}
