import type { Principal } from '../domain/principal';
import type { RateLimitDecision } from '../domain/rate-limit';
import type { RateLimiter } from './ports/rate-limiter';

/** Spends one request of the caller's key. The key is told apart by its id, never by its secret. */
export class EnforceRateLimit {
  constructor(private readonly limiter: RateLimiter) {}

  execute(principal: Principal): RateLimitDecision {
    return this.limiter.consume(principal.apiKeyId);
  }
}
