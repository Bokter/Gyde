export const KEY_HASHER = Symbol('KeyHasher');

/** One-way digest of an API key: the only form in which the gateway keeps a key in memory. */
export interface KeyHasher {
  hash(apiKey: string): string;
}
