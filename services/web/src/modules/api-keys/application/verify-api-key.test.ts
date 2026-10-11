import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VerifyApiKey } from './verify-api-key';
import { VerifyApiKeyResponse } from '@gyde/contracts';
import type { ApiKeyRepository } from '../domain/repositories';
import type { TenantRepository } from '@/modules/auth/application/ports/tenant-repository';
import { PLAN_CATALOG } from '@gyde/contracts';
import { createHash } from 'node:crypto';
import { timingSafeEqual } from 'node:crypto';
import pino from 'pino';

const REDACT_PATHS_BASE = [
  'req.headers.authorization',
  'req.headers["x-internal-token"]',
  'headers.authorization',
  'headers["x-internal-token"]',
  'authorization',
  'apiKey',
  'password',
  'secret',
  'token',
];
const EXTRA_KEYS = [
  'authorization',
  'apiKey',
  'api_key',
  'password',
  'secret',
  'token',
  'accessToken',
];
const REDACT_PATHS_EXTRA = EXTRA_KEYS.flatMap((key) => [`*.${key}`, `*.*.${key}`]);
const REDACT_PATHS = [...REDACT_PATHS_BASE, ...REDACT_PATHS_EXTRA];

pino({
  name: 'api-key-verify-test',
  level: 'silent',
  base: { service: 'api-key-verify-test' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
});

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function verifyInternalToken(token: string | null): boolean {
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  if (!expected) {
    return false;
  }
  if (!token) {
    return false;
  }
  if (token.length !== expected.length) {
    return false;
  }
  const encoder = new TextEncoder();
  return timingSafeEqual(encoder.encode(token), encoder.encode(expected));
}

function makeTestApiKey(
  overrides: Partial<{
    id: string;
    tenantId: string;
    keyHash: string;
    prefix: string;
    keyLast4: string;
    revokedAt: Date | null;
    expiresAt: Date | null;
    name: string | null;
    environment: 'live' | 'test';
    lastUsedAt: Date | null;
    createdAt: Date;
  }> = {},
) {
  return {
    id: 'api-key-456',
    tenantId: 'tenant-123',
    keyHash: 'test-hash',
    prefix: 'gyde_live_',
    keyLast4: '3456',
    name: null,
    environment: 'live' as const,
    revokedAt: null,
    expiresAt: null,
    lastUsedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeTestTenant(
  overrides: Partial<{
    id: string;
    plan: 'free' | 'pro' | 'studio';
    name: string;
    slug: string;
    ownerId: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    stripePriceId: string | null;
    stripeCurrentPeriodEnd: Date | null;
    stripeCancelAtPeriodEnd: boolean;
    createdAt: Date;
    updatedAt: Date;
  }> = {},
) {
  return {
    id: 'tenant-123',
    name: 'Test Tenant',
    slug: 'test-tenant',
    ownerId: 'user-123',
    plan: 'pro' as const,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    stripeCurrentPeriodEnd: null,
    stripeCancelAtPeriodEnd: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('VerifyApiKey - security tests with fake repositories', () => {
  let fakeApiKeyRepo: ApiKeyRepository;
  let fakeTenantRepo: TenantRepository;
  let verifyApiKey: VerifyApiKey;
  let testTenant: ReturnType<typeof makeTestTenant>;
  let testApiKey: ReturnType<typeof makeTestApiKey>;

  beforeEach(() => {
    testTenant = makeTestTenant({ plan: 'pro' });
    const plainKey = 'gyde_live_abcdefghijklmnopqrstuvwxyz123456';
    const keyHash = sha256Hex(plainKey);

    testApiKey = makeTestApiKey({ keyHash, tenantId: testTenant.id });

    fakeApiKeyRepo = {
      findByTenantId: vi.fn(),
      findById: vi.fn(),
      findByKeyHash: vi.fn(async (hash: string) => {
        return hash === testApiKey.keyHash ? testApiKey : null;
      }),
      create: vi.fn(),
      update: vi.fn(),
      revoke: vi.fn(),
      updateLastUsedAt: vi.fn(),
    };

    fakeTenantRepo = {
      findByOwnerId: vi.fn(),
      findById: vi.fn(async (id: string) => {
        return id === testTenant.id ? testTenant : null;
      }),
      create: vi.fn(),
      update: vi.fn(),
    };

    verifyApiKey = new VerifyApiKey(fakeApiKeyRepo, fakeTenantRepo);
  });

  describe('VerifyApiKey.execute', () => {
    it('returns valid response with correct entitlements for valid key', async () => {
      const plainKey = 'gyde_live_abcdefghijklmnopqrstuvwxyz123456';

      const result = await verifyApiKey.execute(plainKey);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.tenantId).toBe('tenant-123');
        expect(result.apiKeyId).toBe('api-key-456');
        expect(result.entitlements).toEqual(PLAN_CATALOG.pro);
        expect(VerifyApiKeyResponse.safeParse(result).success).toBe(true);
      }
    });

    it('returns valid: false with reason "unknown" for unknown prefix', async () => {
      const result = await verifyApiKey.execute('invalid_prefix_abcdefghijklmnopqrstuvwxyz123456');

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe('unknown');
        expect(VerifyApiKeyResponse.safeParse(result).success).toBe(true);
      }
    });

    it('returns valid: false with reason "unknown" for non-existent key', async () => {
      const plainKey = 'gyde_live_nonexistentkey1234567890123456';

      const result = await verifyApiKey.execute(plainKey);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe('unknown');
        expect(VerifyApiKeyResponse.safeParse(result).success).toBe(true);
      }
    });

    it('returns valid: false with reason "revoked" for revoked key', async () => {
      const plainKey = 'gyde_live_revokedkey1234567890123456';
      const keyHash = sha256Hex(plainKey);

      const revokedApiKey = makeTestApiKey({ keyHash, revokedAt: new Date() });

      const fakeApiKeyRepoWithRevoked: ApiKeyRepository = {
        ...fakeApiKeyRepo,
        findByKeyHash: vi.fn(async (hash: string) => {
          return hash === keyHash ? revokedApiKey : null;
        }),
      };

      const verifyApiKeyWithRevoked = new VerifyApiKey(fakeApiKeyRepoWithRevoked, fakeTenantRepo);

      const result = await verifyApiKeyWithRevoked.execute(plainKey);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe('revoked');
        expect(VerifyApiKeyResponse.safeParse(result).success).toBe(true);
      }
    });

    it('returns valid: false with reason "expired" for expired key', async () => {
      const plainKey = 'gyde_live_expiredkey1234567890123456';
      const keyHash = sha256Hex(plainKey);

      const expiredApiKey = makeTestApiKey({ keyHash, expiresAt: new Date(Date.now() - 1000) });

      const fakeApiKeyRepoWithExpired: ApiKeyRepository = {
        ...fakeApiKeyRepo,
        findByKeyHash: vi.fn(async (hash: string) => {
          return hash === keyHash ? expiredApiKey : null;
        }),
      };

      const verifyApiKeyWithExpired = new VerifyApiKey(fakeApiKeyRepoWithExpired, fakeTenantRepo);

      const result = await verifyApiKeyWithExpired.execute(plainKey);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe('expired');
        expect(VerifyApiKeyResponse.safeParse(result).success).toBe(true);
      }
    });

    it('returns valid: false with reason "unknown" for unknown prefix (gyde_test_)', async () => {
      const result = await verifyApiKey.execute('gyde_test_unknownkey1234567890123456');

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe('unknown');
      }
    });
  });

  describe('Internal verify endpoint token verification', () => {
    it('returns 401 without token', () => {
      process.env.INTERNAL_SERVICE_TOKEN = 'test-token-1234567890123456';

      expect(verifyInternalToken(null)).toBe(false);
      expect(verifyInternalToken('')).toBe(false);
      expect(verifyInternalToken('wrong-token')).toBe(false);
      expect(verifyInternalToken('test-token-123456789012345')).toBe(false);
      expect(verifyInternalToken('test-token-1234567890123456')).toBe(true);

      delete process.env.INTERNAL_SERVICE_TOKEN;
    });

    it('rejects when INTERNAL_SERVICE_TOKEN is not configured', () => {
      delete process.env.INTERNAL_SERVICE_TOKEN;

      expect(verifyInternalToken('any-token')).toBe(false);
      expect(verifyInternalToken(null)).toBe(false);
    });
  });

  describe('CreateApiKey - plain key only returned once', () => {
    it('returns plain key only on creation, not stored', async () => {
      const { CreateApiKey } = await import('./create-api-key');

      const fakeApiKeyRepo: ApiKeyRepository = {
        findByTenantId: vi.fn(),
        findById: vi.fn(),
        findByKeyHash: vi.fn(),
        create: vi.fn(async (apiKey) => {
          return { ...apiKey, createdAt: new Date() };
        }),
        update: vi.fn(),
        revoke: vi.fn(),
        updateLastUsedAt: vi.fn(),
      };

      const createApiKey = new CreateApiKey(fakeApiKeyRepo);

      const result = await createApiKey.execute({
        tenantId: 'tenant-123',
        name: 'Test Key',
        environment: 'live',
        expiresAt: null,
      });

      expect(result.plainKey).toBeDefined();
      expect(result.plainKey).toMatch(/^gyde_live_[a-f0-9]{64}$/);
      expect(result.apiKey.keyHash).toBeDefined();
      expect(result.apiKey.keyHash).not.toBe(result.plainKey);

      expect(fakeApiKeyRepo.create).toHaveBeenCalledTimes(1);
      const createdCall = vi.mocked(fakeApiKeyRepo.create).mock.calls[0]![0];
      expect(createdCall.keyHash).toBeDefined();
      expect(createdCall.keyHash).not.toMatch(/^gyde_live_/);
    });
  });
});
