import type { RateLimitDecision, RateLimiter } from '../application/ports/rate-limiter';

interface Window {
  startedAt: number;
  count: number;
}

export interface MemoryRateLimiterOptions {
  /** Requests allowed per key in each window. */
  limit: number;
  windowMs?: number;
  /** Upper bound of tracked keys; expired windows go first, then the oldest. */
  maxKeys?: number;
  now?: () => number;
}

/** Fixed-window, in-memory `RateLimiter`. Per instance of the gateway, like the usage counter. */
export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, Window>();
  private readonly windowMs: number;
  private readonly maxKeys: number;
  private readonly now: () => number;

  constructor(private readonly options: MemoryRateLimiterOptions) {
    this.windowMs = options.windowMs ?? 60_000;
    this.maxKeys = options.maxKeys ?? 10_000;
    this.now = options.now ?? Date.now;
  }

  consume(apiKeyId: string): RateLimitDecision {
    const now = this.now();
    let window = this.windows.get(apiKeyId);
    if (!window || now - window.startedAt >= this.windowMs) {
      this.makeRoom(now);
      window = { startedAt: now, count: 0 };
      this.windows.set(apiKeyId, window);
    }
    if (window.count >= this.options.limit) {
      const remainingMs = window.startedAt + this.windowMs - now;
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)) };
    }
    window.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  private makeRoom(now: number): void {
    if (this.windows.size < this.maxKeys) return;
    for (const [key, window] of this.windows) {
      if (now - window.startedAt >= this.windowMs) this.windows.delete(key);
    }
    if (this.windows.size >= this.maxKeys) {
      const oldest = this.windows.keys().next().value;
      if (oldest !== undefined) this.windows.delete(oldest);
    }
  }
}
