import { createHash } from 'node:crypto';

import type {
  AiResult,
  DegradedReason,
  InternalLlmConfig,
  LlmAnalysisRequest,
  LlmProvider,
} from '@gyde/contracts';
import {
  CircuitBreaker,
  type CircuitBreakerOptions,
  type FallbackCache,
  MemoryFallbackCache,
  createBreakerFromEnv,
} from '@gyde/resilience';

import { redactSecrets, truncateMessage } from '../domain/redact';
import type { FindingAnalyzer } from './ports/finding-analyzer';
import type { ReportsClient } from './ports/reports-client';
import type { TenantLlmConfigProvider } from './ports/tenant-llm-config';

/**
 * Synthetic config handed to the mock analyzer so `FindingAnalyzer` keeps a single signature.
 * The mock never reads any of it; the key below is not a secret.
 */
function mockConfig(tenantId: string): InternalLlmConfig {
  return { tenantId, provider: 'anthropic', model: 'gyde-mock', apiKey: 'mock-key' };
}

export interface AnalyzeFindingsDeps {
  tenantConfig: TenantLlmConfigProvider;
  /**
   * The real providers this service can talk to, by `LlmProvider` (Anthropic today), used when
   * the tenant has a key. A provider missing here is not supported: its key is never sent anywhere.
   */
  analyzers: Partial<Record<LlmProvider, FindingAnalyzer>>;
  /** Development only: answers instead of the real provider when the tenant has no key. */
  mockAnalyzer?: FindingAnalyzer;
  mockEnabled: boolean;
  reports: ReportsClient;
  /** Overrides the `CB_*` defaults of the per tenant + provider breakers (tests). */
  breakerOptions?: Partial<CircuitBreakerOptions>;
  /** Injectable clock for the fallback cache (tests). */
  now?: () => number;
  /** Last resort: a bug here is logged, never thrown into the caller. */
  onError?: (error: unknown, context: string) => void;
}

/**
 * Use case: interpret and correlate the evidence of one analysis with the project context.
 *
 *  1. Fetch the tenant's LLM config (BYOK). Not configured -> publish AnalysisFailure
 *     `llm-not-configured`; the report stays deterministic and tells the studio what to do.
 *     Web being unreachable is `llm-unavailable`: the key may well exist.
 *  2. Pick the analyzer of the tenant's provider; a provider without one (OpenAI today) is
 *     `llm-error` and nothing is sent out. Call it behind a Circuit Breaker scoped per
 *     TENANT + PROVIDER, so one studio's invalid key or rate limit never opens the circuit for
 *     the others.
 *  3. Validate the model output with the `AiResult` schema and publish it to Reports.
 *  4. Provider down / circuit open -> `llm-unavailable` (serve the last cached classification
 *     when the same findings already produced one); provider error -> `llm-error`.
 *     Never throws into the caller.
 *
 * The API key never appears in logs, errors or the published messages: it is used for one call
 * and every message that leaves here goes through `redactSecrets`.
 */
export class AnalyzeFindings {
  private readonly breakers = new Map<string, CircuitBreaker>();
  /** Last AI result per tenant + provider + fingerprint of the findings it explained. */
  private readonly fallbackCache: FallbackCache<AiResult>;

  constructor(private readonly deps: AnalyzeFindingsDeps) {
    this.fallbackCache = new MemoryFallbackCache<AiResult>({
      maxEntries: 100,
      ttlMs: 300_000,
      ...(deps.now && { now: deps.now }),
    });
  }

  async execute(request: LlmAnalysisRequest): Promise<void> {
    try {
      await this.run(request);
    } catch (error) {
      // The caller (Retrieval, through the 202 of the controller) must never see this throw.
      this.deps.onError?.(error, 'analyze-findings');
    }
  }

  private async run(request: LlmAnalysisRequest): Promise<void> {
    let llmConfig: InternalLlmConfig | undefined;
    try {
      llmConfig = await this.deps.tenantConfig.getConfig(request.tenantId);
    } catch (error) {
      await this.publishFailure(
        request.analysisId,
        'llm-unavailable',
        `Tenant LLM configuration is unavailable: ${describe(error)}`,
      );
      return;
    }

    if (!llmConfig?.apiKey) {
      if (this.deps.mockEnabled && this.deps.mockAnalyzer) {
        await this.callProvider(
          request,
          `${request.tenantId}:mock`,
          this.deps.mockAnalyzer,
          mockConfig(request.tenantId),
        );
        return;
      }
      await this.publishFailure(
        request.analysisId,
        'llm-not-configured',
        'Studio has not configured an LLM API key',
      );
      return;
    }

    // The analyzer follows the tenant's provider: a key is only ever handed to the provider it
    // belongs to. No analyzer for it means nothing is called (and so no breaker is touched).
    const analyzer = Object.hasOwn(this.deps.analyzers, llmConfig.provider)
      ? this.deps.analyzers[llmConfig.provider]
      : undefined;
    if (!analyzer) {
      await this.publishFailure(
        request.analysisId,
        'llm-error',
        `LLM provider "${llmConfig.provider}" is not supported yet`,
        llmConfig.apiKey,
      );
      return;
    }

    await this.callProvider(
      request,
      `${request.tenantId}:${llmConfig.provider}`,
      analyzer,
      llmConfig,
    );
  }

  private async callProvider(
    request: LlmAnalysisRequest,
    breakerKey: string,
    analyzer: FindingAnalyzer,
    config: InternalLlmConfig,
  ): Promise<void> {
    const breaker = this.getBreaker(breakerKey);

    if (this.isOpen(breaker)) {
      // Without a cached classification the report simply stays deterministic.
      const cached = await this.fallbackCache.get(this.cacheKey(request, breakerKey));
      if (cached) {
        await this.deps.reports.publishAiResult({
          ...cached.value,
          analysisId: request.analysisId,
        });
      } else {
        await this.publishFailure(
          request.analysisId,
          'llm-unavailable',
          'LLM provider circuit breaker is open',
          config.apiKey,
        );
      }
      return;
    }

    try {
      const aiResult = await breaker.execute(() => analyzer.analyze(request, config));
      await this.fallbackCache.set(this.cacheKey(request, breakerKey), aiResult);
      await this.deps.reports.publishAiResult(aiResult);
    } catch (error) {
      // A failure that just opened the breaker is an outage of the provider, not a bad answer.
      const reason: DegradedReason = this.isOpen(breaker) ? 'llm-unavailable' : 'llm-error';
      await this.publishFailure(request.analysisId, reason, describe(error), config.apiKey);
    }
  }

  private async publishFailure(
    analysisId: string,
    reason: DegradedReason,
    message: string,
    secret?: string,
  ): Promise<void> {
    await this.deps.reports.publishFailure({
      analysisId,
      stage: 'llm',
      reason,
      message: truncateMessage(redactSecrets(message, [secret])),
    });
  }

  /** One breaker per TENANT + PROVIDER: a studio's broken key never affects the others. */
  private getBreaker(breakerKey: string): CircuitBreaker {
    let breaker = this.breakers.get(breakerKey);
    if (!breaker) {
      breaker = new CircuitBreaker({
        ...createBreakerFromEnv(`llm:${breakerKey}`),
        ...this.deps.breakerOptions,
      });
      this.breakers.set(breakerKey, breaker);
    }
    return breaker;
  }

  /**
   * `state` is a getter that also performs the open → half-open transition, so it is read
   * through this method: TypeScript cannot keep a stale narrowing of it across an `await`.
   */
  private isOpen(breaker: CircuitBreaker): boolean {
    return breaker.state === 'open';
  }

  /**
   * The cached classification is keyed by what it explains, never by `analysisId` (a new analysis
   * gets a new id): the same tenant, provider and findings can reuse the last answer.
   */
  private cacheKey(request: LlmAnalysisRequest, breakerKey: string): string {
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ findings: request.findings, evidence: request.evidence }))
      .digest('hex')
      .slice(0, 16);
    return `${breakerKey}:${fingerprint}`;
  }
}

/** A short reason for a failure: name and message only, never request data. */
function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
}
