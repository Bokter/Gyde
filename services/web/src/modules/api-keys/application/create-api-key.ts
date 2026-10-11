import type { ApiKey } from '../domain/entities';
import type { ApiKeyRepository } from '../domain/repositories';

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
    const prefix = input.environment === 'live' ? 'gyde_live_' : 'gyde_test_';
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    const randomPart = Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const plainKey = `${prefix}${randomPart}`;

    // Hash the key for storage
    const encoder = new TextEncoder();
    const keyData = encoder.encode(plainKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', keyData);
    const keyHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const keyLast4 = plainKey.slice(-4);

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
