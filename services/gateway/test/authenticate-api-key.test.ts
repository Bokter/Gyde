import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { AuthenticateApiKey } from '../src/application/authenticate-api-key';
import type { AuthCache } from '../src/application/ports/auth-cache';
import type { Principal } from '../src/application/principal';
import { MemoryAuthCache } from '../src/infrastructure/memory-auth-cache';
import { Sha256KeyHasher } from '../src/infrastructure/sha256-key-hasher';
import { VALID_KEY, validVerification } from './helpers';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('AuthenticateApiKey cache keys', () => {
  it('indexes the cache by the SHA-256 of the key and never by the key itself', async () => {
    const seen: string[] = [];
    const cache: AuthCache = {
      get: (keyHash) => {
        seen.push(keyHash);
        return undefined;
      },
      set: (keyHash) => void seen.push(keyHash),
    };
    const authenticate = new AuthenticateApiKey({
      verifier: { verify: async () => validVerification },
      hasher: new Sha256KeyHasher(),
      cache,
    });

    await authenticate.execute(VALID_KEY, { requestId: 'r' });

    expect(seen).toEqual([sha256(VALID_KEY), sha256(VALID_KEY)]);
    expect(seen).not.toContain(VALID_KEY);
  });
});

describe('MemoryAuthCache', () => {
  const principal: Principal = {
    tenantId: 't',
    apiKeyId: 'k',
    entitlements: validVerification.valid ? validVerification.entitlements : (undefined as never),
  };

  it('forgets an entry after its TTL', () => {
    let now = 0;
    const cache = new MemoryAuthCache({ ttlMs: 1000, now: () => now });
    cache.set('h', principal);
    now = 999;
    expect(cache.get('h')).toBe(principal);
    now = 1000;
    expect(cache.get('h')).toBeUndefined();
  });

  it('drops the oldest entry when it is full', () => {
    const cache = new MemoryAuthCache({ ttlMs: 1000, maxEntries: 2 });
    cache.set('a', principal);
    cache.set('b', principal);
    cache.set('c', principal);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(principal);
    expect(cache.get('c')).toBe(principal);
  });
});
