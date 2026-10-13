export type ApiKeyEnvironment = 'live' | 'test';

export interface GeneratedApiKey {
  prefix: string;
  /** Shown once to the caller; never stored. */
  plainKey: string;
  keyHash: string;
  keyLast4: string;
}

/** SHA-256 hex digest: the only form of an API key that is stored and looked up. */
export async function hashApiKey(plainKey: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plainKey));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** A new `gyde_<environment>_` key with 32 random bytes, plus what gets stored for it. */
export async function generateApiKey(environment: ApiKeyEnvironment): Promise<GeneratedApiKey> {
  const prefix = environment === 'live' ? 'gyde_live_' : 'gyde_test_';
  const randomPart = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const plainKey = `${prefix}${randomPart}`;
  return { prefix, plainKey, keyHash: await hashApiKey(plainKey), keyLast4: plainKey.slice(-4) };
}
