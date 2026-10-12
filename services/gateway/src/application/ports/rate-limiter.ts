export const RATE_LIMITER = Symbol('RateLimiter');

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the caller may try again; 0 when allowed. */
  retryAfterSeconds: number;
}

/** Counts the requests of one API key in a time window. */
export interface RateLimiter {
  consume(apiKeyId: string): RateLimitDecision;
}
