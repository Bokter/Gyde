import type { AuthCache } from '../application/ports/auth-cache';
import type { Principal } from '../application/principal';

interface Entry {
  principal: Principal;
  expiresAt: number;
}

export interface MemoryAuthCacheOptions {
  /** How long a verified key is trusted without asking Web again. */
  ttlMs: number;
  /** Upper bound of remembered keys; the oldest entry goes first. */
  maxEntries?: number;
  now?: () => number;
}

/** In-memory `AuthCache`. Entries are keyed by the hash of the key, never by the key. */
export class MemoryAuthCache implements AuthCache {
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;
  private readonly maxEntries: number;

  constructor(private readonly options: MemoryAuthCacheOptions) {
    this.now = options.now ?? Date.now;
    this.maxEntries = options.maxEntries ?? 10_000;
  }

  get(keyHash: string): Principal | undefined {
    const entry = this.entries.get(keyHash);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(keyHash);
      return undefined;
    }
    return entry.principal;
  }

  set(keyHash: string, principal: Principal): void {
    this.entries.delete(keyHash);
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(keyHash, { principal, expiresAt: this.now() + this.options.ttlMs });
  }
}
