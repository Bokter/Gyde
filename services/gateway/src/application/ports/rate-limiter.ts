import type { RateLimitDecision } from '../../domain/rate-limit';

export const RATE_LIMITER = Symbol('RateLimiter');

/** Counts the requests of one API key in a time window. */
export interface RateLimiter {
  consume(apiKeyId: string): RateLimitDecision;
}
