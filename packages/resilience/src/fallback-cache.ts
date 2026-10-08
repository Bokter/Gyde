/**
 * Local cache / fallback (architecture doc, "Caché local / Fallback"): keeps the last valid
 * response of a dependency so it can be served while the circuit is open.
 *
 * Two stores are planned: in-memory (services) and on-disk (the CLI keeps it in a local folder,
 * which is also what GitHub Actions can persist between runs).
 *
 * TODO(area-1): implement MemoryFallbackCache and FileFallbackCache.
 */

export interface CacheEntry<T> {
  value: T;
  /** Epoch milliseconds when the value was stored; lets callers show "last updated X ago". */
  storedAt: number;
}

export interface FallbackCache<T = unknown> {
  get(key: string): Promise<CacheEntry<T> | undefined>;
  set(key: string, value: T): Promise<void>;
}

export interface MemoryFallbackCacheOptions {
  /** Maximum number of entries; the least recently used is evicted first. */
  maxEntries: number;
  /** Entries older than this are ignored. Omit to keep them until evicted. */
  ttlMs?: number;
  now?: () => number;
}

export class MemoryFallbackCache<T = unknown> implements FallbackCache<T> {
  readonly options: MemoryFallbackCacheOptions;

  constructor(options: MemoryFallbackCacheOptions) {
    this.options = options;
  }

  async get(_key: string): Promise<CacheEntry<T> | undefined> {
    throw new Error('TODO(area-1): MemoryFallbackCache.get is not implemented yet');
  }

  async set(_key: string, _value: T): Promise<void> {
    throw new Error('TODO(area-1): MemoryFallbackCache.set is not implemented yet');
  }
}

export interface FileFallbackCacheOptions {
  /** Folder where entries are stored, e.g. ~/.gyde/cache or the Actions cache path. */
  directory: string;
  ttlMs?: number;
}

export class FileFallbackCache<T = unknown> implements FallbackCache<T> {
  readonly options: FileFallbackCacheOptions;

  constructor(options: FileFallbackCacheOptions) {
    this.options = options;
  }

  async get(_key: string): Promise<CacheEntry<T> | undefined> {
    throw new Error('TODO(area-1): FileFallbackCache.get is not implemented yet');
  }

  async set(_key: string, _value: T): Promise<void> {
    throw new Error('TODO(area-1): FileFallbackCache.set is not implemented yet');
  }
}
