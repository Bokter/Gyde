import { describe, it, expect } from 'vitest';
import { toApiKeyView } from './api-key-view';
import type { ApiKey } from '../domain/entities';

describe('toApiKeyView', () => {
  it('never exposes the key hash to the dashboard', () => {
    const keyHash = 'a'.repeat(64);
    const apiKey: ApiKey = {
      id: 'key-1',
      tenantId: 'tenant-1',
      prefix: 'gyde_test_',
      keyHash,
      keyLast4: '9f3c',
      name: 'CI',
      environment: 'test',
      expiresAt: null,
      revokedAt: null,
      lastUsedAt: new Date('2026-10-10T12:00:00Z'),
      createdAt: new Date('2026-10-09T12:00:00Z'),
    };

    const view = toApiKeyView(apiKey);
    const json = JSON.stringify(view);

    expect(Object.keys(view)).not.toContain('keyHash');
    expect(Object.keys(view)).not.toContain('tenantId');
    expect(json).not.toContain(keyHash);
    expect(view).toMatchObject({ prefix: 'gyde_test_', keyLast4: '9f3c', status: 'active' });
  });
});
