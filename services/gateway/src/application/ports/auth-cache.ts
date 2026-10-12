import type { Principal } from '../principal';

export const AUTH_CACHE = Symbol('AuthCache');

/** Short-lived memory of verified keys, indexed by the hash of the key (never the key). */
export interface AuthCache {
  get(keyHash: string): Principal | undefined;
  set(keyHash: string, principal: Principal): void;
}
