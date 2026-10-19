export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the caller may try again; 0 when allowed. */
  retryAfterSeconds: number;
}

/**
 * One fixed window of requests of one API key. The window opens with the first request after the
 * previous one ended; inside it, `limit` requests are allowed and the rest wait for it to close.
 * The clock and the sizes come in as arguments: this class never reads the time.
 */
export class RateLimitWindow {
  private count = 0;

  private constructor(private readonly startedAt: number) {}

  static open(now: number): RateLimitWindow {
    return new RateLimitWindow(now);
  }

  hasExpired(now: number, windowMs: number): boolean {
    return now - this.startedAt >= windowMs;
  }

  /** Spends one request of the window, or says how long to wait when it is used up. */
  consume(now: number, limit: number, windowMs: number): RateLimitDecision {
    if (this.count >= limit) {
      const remainingMs = this.startedAt + windowMs - now;
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)) };
    }
    this.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
