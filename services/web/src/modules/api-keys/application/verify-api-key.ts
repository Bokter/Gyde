import type { Entitlements, Plan } from '@gyde/contracts';
import { PLAN_CATALOG } from '@gyde/contracts';
import type { ApiKeyRepository } from '../domain/repositories';
import type { TenantRepository } from '@/modules/auth/application/ports/tenant-repository';

export interface VerifyApiKeyResult {
  valid: true;
  tenantId: string;
  apiKeyId: string;
  entitlements: Entitlements;
}

export interface VerifyApiKeyFailure {
  valid: false;
  reason: 'unknown' | 'revoked' | 'expired' | 'suspended';
}

export type VerifyApiKeyOutput = VerifyApiKeyResult | VerifyApiKeyFailure;

export class VerifyApiKey {
  constructor(
    private readonly apiKeyRepository: ApiKeyRepository,
    private readonly tenantRepository: TenantRepository,
  ) {}

  async execute(apiKey: string): Promise<VerifyApiKeyOutput> {
    // Extract prefix and hash the provided key
    const prefixEnd = apiKey.indexOf('_', 5); // Find second underscore
    if (prefixEnd === -1) {
      return { valid: false, reason: 'unknown' };
    }

    const prefix = apiKey.slice(0, prefixEnd + 1);

    if (prefix !== 'gyde_live_' && prefix !== 'gyde_test_') {
      return { valid: false, reason: 'unknown' };
    }

    // Hash the key
    const encoder = new TextEncoder();
    const keyData = encoder.encode(apiKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', keyData);
    const keyHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const storedKey = await this.apiKeyRepository.findByKeyHash(keyHash);
    if (!storedKey) {
      return { valid: false, reason: 'unknown' };
    }

    // Check if revoked
    if (storedKey.revokedAt) {
      return { valid: false, reason: 'revoked' };
    }

    // Check if expired
    if (storedKey.expiresAt && storedKey.expiresAt < new Date()) {
      return { valid: false, reason: 'expired' };
    }

    // Update last used timestamp
    await this.apiKeyRepository.updateLastUsedAt(storedKey.id);

    // Get entitlements based on tenant's plan
    const tenant = await this.tenantRepository.findById(storedKey.tenantId);
    if (!tenant) {
      return { valid: false, reason: 'unknown' };
    }

    const entitlements = PLAN_CATALOG[tenant.plan as Plan];

    return {
      valid: true,
      tenantId: storedKey.tenantId,
      apiKeyId: storedKey.id,
      entitlements,
    };
  }
}
