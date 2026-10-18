import { redactSecrets, truncateMessage } from '../domain/redact';
import type {
  AnalyzeFindingsDto,
  FailureReason,
  LlmProviderName,
  TenantLlmConfig,
} from './dto/llm-analysis.dto';
import type { FindingAnalyzer } from './ports/finding-analyzer';
import type { ModelCallPolicy } from './ports/model-call-policy';
import type { ReportsClient } from './ports/reports-client';
import type { TenantLlmConfigProvider } from './ports/tenant-llm-config';

/**
 * Synthetic config handed to the mock analyzer so `FindingAnalyzer` keeps a single signature.
 * The mock never reads any of it; the key below is not a secret.
 */
function mockConfig(tenantId: string): TenantLlmConfig {
  return { tenantId, provider: 'anthropic', model: 'gyde-mock', apiKey: 'mock-key' };
}

export interface AnalyzeFindingsDeps {
  tenantConfig: TenantLlmConfigProvider;
  /**
   * The real providers this service can talk to, by `LlmProviderName` (Anthropic today), used when
   * the tenant has a key. A provider missing here is not supported: its key is never sent anywhere.
   */
  analyzers: Partial<Record<LlmProviderName, FindingAnalyzer>>;
  /** Development only: answers instead of the real provider when the tenant has no key. */
  mockAnalyzer?: FindingAnalyzer;
  mockEnabled: boolean;
  reports: ReportsClient;
  /** Breaker per tenant + provider and fallback cache of the model calls. */
  modelCalls: ModelCallPolicy;
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
 *  3. Publish the validated model output to Reports (the adapters validate it with the
 *     `AiResult` contract).
 *  4. Provider down / circuit open -> `llm-unavailable` (serve the last cached classification
 *     when the same findings already produced one); provider error -> `llm-error`.
 *     Never throws into the caller.
 *
 * The API key never appears in logs, errors or the published messages: it is used for one call
 * and every message that leaves here goes through `redactSecrets`.
 */
export class AnalyzeFindings {
  constructor(private readonly deps: AnalyzeFindingsDeps) {}

  async execute(request: AnalyzeFindingsDto): Promise<void> {
    try {
      await this.run(request);
    } catch (error) {
      // The caller (Retrieval, through the 202 of the controller) must never see this throw.
      this.deps.onError?.(error, 'analyze-findings');
    }
  }

  private async run(request: AnalyzeFindingsDto): Promise<void> {
    let llmConfig: TenantLlmConfig | undefined;
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
    request: AnalyzeFindingsDto,
    breakerKey: string,
    analyzer: FindingAnalyzer,
    config: TenantLlmConfig,
  ): Promise<void> {
    const outcome = await this.deps.modelCalls.run(breakerKey, request, () =>
      analyzer.analyze(request, config),
    );

    if (outcome.status === 'circuit-open') {
      if (outcome.cached) {
        await this.deps.reports.publishAiResult({
          ...outcome.cached,
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

    if (outcome.status === 'failed') {
      // A failure that just opened the breaker is an outage of the provider, not a bad answer.
      const reason: FailureReason = outcome.circuitOpen ? 'llm-unavailable' : 'llm-error';
      await this.publishFailure(request.analysisId, reason, describe(outcome.error), config.apiKey);
      return;
    }

    try {
      await this.deps.reports.publishAiResult(outcome.value);
    } catch (error) {
      const reason: FailureReason = this.deps.modelCalls.isOpen(breakerKey)
        ? 'llm-unavailable'
        : 'llm-error';
      await this.publishFailure(request.analysisId, reason, describe(error), config.apiKey);
    }
  }

  private async publishFailure(
    analysisId: string,
    reason: FailureReason,
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
}

/** A short reason for a failure: name and message only, never request data. */
function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
}
