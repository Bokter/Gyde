import type { Entitlements } from '@gyde/contracts';
import type { ApiKeyRepository } from '../domain/repositories';

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
  constructor(private readonly apiKeyRepository: ApiKeyRepository) {}

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
    const entitlements = this.getEntitlements(storedKey.tenantId);

    return {
      valid: true,
      tenantId: storedKey.tenantId,
      apiKeyId: storedKey.id,
      entitlements,
    };
  }

  private getEntitlements(_tenantId: string): Entitlements {
    // This would normally fetch from a tenant repository
    // For now, return free plan entitlements as default
    // The actual implementation will be wired with the tenant repository
    return {
      plan: 'free',
      limits: { analysesPerMonth: 30, projects: 1 },
      features: {
        licenseCompliance: true,
        compatibilityAnalysis: false,
        severityScoring: true,
        aiEnrichment: false,
      },
    };
  }
}
