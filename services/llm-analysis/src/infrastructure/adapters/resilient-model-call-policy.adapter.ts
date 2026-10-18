import { createHash } from 'node:crypto';

import {
  CircuitBreaker,
  type CircuitBreakerOptions,
  type FallbackCache,
  MemoryFallbackCache,
  createBreakerFromEnv,
} from '@gyde/resilience';

import type { AnalyzeFindingsDto } from '../application/dto/llm-analysis.dto';
import type { ModelCallOutcome, ModelCallPolicy } from '../application/ports/model-call-policy';
import type { AiAnalysis } from '../domain/analysis';

export interface ResilientModelCallPolicyOptions {
  /** Overrides the `CB_*` defaults of the per tenant + provider breakers. */
  breakerOptions?: Partial<CircuitBreakerOptions>;
  /** Injectable clock for the fallback cache (tests). */
  now?: () => number;
}

/**
 * `ModelCallPolicy` over `@gyde/resilience`: one `CircuitBreaker` per scope (created on first use
 * and kept for the life of this object, so it must be a singleton) and a `MemoryFallbackCache`
 * with the last answer per scope + fingerprint of the findings.
 */
export class ResilientModelCallPolicy implements ModelCallPolicy {
  private readonly breakers = new Map<string, CircuitBreaker>();
  /** Last AI result per tenant + provider + fingerprint of the findings it explained. */
  private readonly fallbackCache: FallbackCache<AiAnalysis>;

  constructor(private readonly options: ResilientModelCallPolicyOptions = {}) {
    this.fallbackCache = new MemoryFallbackCache<AiAnalysis>({
      maxEntries: 100,
      ttlMs: 300_000,
      ...(options.now && { now: options.now }),
    });
  }

  async run(
    scope: string,
    request: AnalyzeFindingsDto,
    call: () => Promise<AiAnalysis>,
  ): Promise<ModelCallOutcome> {
    const breaker = this.getBreaker(scope);

    if (this.isBreakerOpen(breaker)) {
      // Without a cached classification the report simply stays deterministic.
      const cached = await this.fallbackCache.get(this.cacheKey(request, scope));
      return { status: 'circuit-open', cached: cached?.value };
    }

    try {
      const value = await breaker.execute(call);
      await this.fallbackCache.set(this.cacheKey(request, scope), value);
      return { status: 'ok', value };
    } catch (error) {
      return { status: 'failed', error, circuitOpen: this.isBreakerOpen(breaker) };
    }
  }

  isOpen(scope: string): boolean {
    return this.isBreakerOpen(this.getBreaker(scope));
  }

  /** One breaker per TENANT + PROVIDER: a studio's broken key never affects the others. */
  private getBreaker(scope: string): CircuitBreaker {
    let breaker = this.breakers.get(scope);
    if (!breaker) {
      breaker = new CircuitBreaker({
        ...createBreakerFromEnv(`llm:${scope}`),
        ...this.options.breakerOptions,
      });
      this.breakers.set(scope, breaker);
    }
    return breaker;
  }

  /**
   * `state` is a getter that also performs the open → half-open transition, so it is read
   * through this method: TypeScript cannot keep a stale narrowing of it across an `await`.
   */
  private isBreakerOpen(breaker: CircuitBreaker): boolean {
    return breaker.state === 'open';
  }

  /**
   * The cached classification is keyed by what it explains, never by `analysisId` (a new analysis
   * gets a new id): the same tenant, provider and findings can reuse the last answer.
   */
  private cacheKey(request: AnalyzeFindingsDto, scope: string): string {
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ findings: request.findings, evidence: request.evidence }))
      .digest('hex')
      .slice(0, 16);
    return `${scope}:${fingerprint}`;
  }
}
