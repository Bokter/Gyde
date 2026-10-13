/**
 * Local cache / fallback (architecture doc, "Caché local / Fallback"): keeps the last valid
 * response of a dependency so it can be served while the circuit is open.
 *
 * Two stores:
 *  - MemoryFallbackCache: in-process LRU + TTL cache for services.
 *  - FileFallbackCache: persists to disk across process restarts; intended for the CLI / GitHub
 *    Action so the last successful report survives between runs.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface CacheEntry<T> {
  value: T;
  /** Epoch milliseconds when the value was stored; lets callers show "last updated X ago". */
  storedAt: number;
}

export interface FallbackCache<T = unknown> {
  get(key: string): Promise<CacheEntry<T> | undefined>;
  set(key: string, value: T): Promise<void>;
}

// ---------------------------------------------------------------------------
// MemoryFallbackCache (LRU + TTL)
// ---------------------------------------------------------------------------

export interface MemoryFallbackCacheOptions {
  /** Maximum number of entries; the least recently used is evicted first. */
  maxEntries: number;
  /** Entries older than this are ignored. Omit to keep them until evicted. */
  ttlMs?: number;
  now?: () => number;
}

export class MemoryFallbackCache<T = unknown> implements FallbackCache<T> {
  readonly options: MemoryFallbackCacheOptions;
  /** Insertion-order map — most-recently-used is at the end. */
  private readonly store: Map<string, CacheEntry<T>> = new Map();

  constructor(options: MemoryFallbackCacheOptions) {
    this.options = options;
  }

  async get(key: string): Promise<CacheEntry<T> | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    const { ttlMs, now = Date.now } = this.options;
    if (ttlMs !== undefined && now() - entry.storedAt > ttlMs) {
      this.store.delete(key);
      return undefined;
    }

    // Refresh LRU position: delete + re-insert moves it to the end.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry;
  }

  async set(key: string, value: T): Promise<void> {
    const { now = Date.now } = this.options;
    // If key already exists, remove it first so it moves to the end (most-recent).
    this.store.delete(key);
    this.store.set(key, { value, storedAt: now() });
    this.evictIfNeeded();
  }

  private evictIfNeeded(): void {
    while (this.store.size > this.options.maxEntries) {
      // The first key in the Map is the least recently used.
      const lruKey = this.store.keys().next().value;
      if (lruKey !== undefined) this.store.delete(lruKey);
    }
  }
}

// ---------------------------------------------------------------------------
// FileFallbackCache (persists across restarts)
// ---------------------------------------------------------------------------

export interface FileFallbackCacheOptions {
  /** Folder where entries are stored, e.g. ~/.gyde/cache or the Actions cache path. */
  directory: string;
  ttlMs?: number;
  /** Injectable clock so tests are deterministic. Defaults to Date.now. */
  now?: () => number;
}

export class FileFallbackCache<T = unknown> implements FallbackCache<T> {
  readonly options: FileFallbackCacheOptions;

  constructor(options: FileFallbackCacheOptions) {
    this.options = options;
  }

  async get(key: string): Promise<CacheEntry<T> | undefined> {
    try {
      const raw = await readFile(this.pathFor(key), 'utf8');
      const entry = JSON.parse(raw) as CacheEntry<T>;

      const { ttlMs, now = Date.now } = this.options;
      if (ttlMs !== undefined && now() - entry.storedAt > ttlMs) {
        return undefined;
      }

      return entry;
    } catch {
      // File missing or unreadable → no cached entry.
      return undefined;
    }
  }

  async set(key: string, value: T): Promise<void> {
    const { now = Date.now } = this.options;
    const entry: CacheEntry<T> = { value, storedAt: now() };
    await mkdir(this.options.directory, { recursive: true });
    await writeFile(this.pathFor(key), JSON.stringify(entry), 'utf8');
  }

  /** Turns an arbitrary cache key into a safe filename. */
  private pathFor(key: string): string {
    const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this.options.directory, `${safe}.json`);
  }
}
