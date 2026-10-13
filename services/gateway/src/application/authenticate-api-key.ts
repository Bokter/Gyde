import { VerifyApiKeyRequest } from '@gyde/contracts';
import { HttpError } from '@gyde/service-kit';

import type { AuthCache } from './ports/auth-cache';
import type { ApiKeyVerifier } from './ports/api-key-verifier';
import type { KeyHasher } from './ports/key-hasher';
import type { Principal, RequestContext } from './principal';

export interface AuthenticateApiKeyDeps {
  verifier: ApiKeyVerifier;
  hasher: KeyHasher;
  cache: AuthCache;
}

/**
 * Turns `Authorization: Bearer <key>` into a `Principal`.
 *
 * A verified key is remembered briefly (the cache's TTL, about a minute) under the SHA-256 of the
 * key, so a key revoked in Web may keep working until its entry expires: that is accepted.
 * Rejections are not cached, so a key created a moment ago works at once.
 */
export class AuthenticateApiKey {
  constructor(private readonly deps: AuthenticateApiKeyDeps) {}

  async execute(apiKey: string | undefined, context: RequestContext): Promise<Principal> {
    // Web would answer 400 to a key outside the contract bounds: refuse it here, without a call.
    const parsed = VerifyApiKeyRequest.safeParse({ apiKey });
    if (!parsed.success) throw unauthorized();

    const keyHash = this.deps.hasher.hash(parsed.data.apiKey);
    const cached = this.deps.cache.get(keyHash);
    if (cached) return cached;

    const result = await this.deps.verifier.verify(parsed.data.apiKey, context);
    if (!result.valid) throw unauthorized();

    const principal: Principal = {
      tenantId: result.tenantId,
      apiKeyId: result.apiKeyId,
      entitlements: result.entitlements,
    };
    this.deps.cache.set(keyHash, principal);
    return principal;
  }
}

function unauthorized(): HttpError {
  // One message for every reason (unknown, revoked, expired, malformed): nothing to enumerate.
  return new HttpError('unauthorized', 'Missing or invalid API key');
}
