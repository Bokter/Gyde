import type { CircuitBreakerOptions } from '@gyde/resilience';
import { APP_CONFIG, ResilientHttpClient } from '@gyde/service-kit';
import { type DynamicModule, Logger, Module } from '@nestjs/common';

import { AnalyzeFindings } from './application/analyze-findings';
import { BackgroundJobs } from './application/background-jobs';
import { FINDING_ANALYZER, type FindingAnalyzer } from './application/ports/finding-analyzer';
import { MODEL_CALL_POLICY, type ModelCallPolicy } from './application/ports/model-call-policy';
import { REPORTS_CLIENT, type ReportsClient } from './application/ports/reports-client';
import {
  TENANT_LLM_CONFIG_PROVIDER,
  type TenantLlmConfigProvider,
} from './application/ports/tenant-llm-config';
import type { Config } from './config';
import { LlmAnalysisController } from './http/llm-analysis.controller';
import { AnthropicFindingAnalyzer } from './infrastructure/providers/anthropic-finding-analyzer';
import { GeminiFindingAnalyzer } from './infrastructure/providers/gemini-finding-analyzer';
import { HttpReportsClient } from './infrastructure/providers/http-reports-client';
import { HttpTenantLlmConfigProvider } from './infrastructure/providers/http-tenant-llm-config.provider';
import { MockFindingAnalyzer } from './infrastructure/providers/mock-finding-analyzer';
import { ResilientModelCallPolicy } from './infrastructure/resilient-model-call-policy';
import { createServiceResolver } from './infrastructure/service-resolver';

const INTERNAL_HTTP = Symbol('ResilientHttpClient');
/** The mock is not a port: it is one more adapter of `FINDING_ANALYZER`, chosen by configuration. */
const MOCK_FINDING_ANALYZER = Symbol('MockFindingAnalyzer');
/** The Gemini adapter: one more adapter of the `FindingAnalyzer` port, chosen by the tenant's provider. */
const GEMINI_FINDING_ANALYZER = Symbol('GeminiFindingAnalyzer');

/** Extra time the breaker allows on top of the provider's timeout, so the provider's wins. */
const BREAKER_MARGIN_MS = 15_000;

/**
 * `CB_CALL_TIMEOUT_MS` (10 s) fits calls between our own services, but a real model answer
 * (up to 4096 tokens) can take longer. The LLM breakers use the provider's timeout plus a margin:
 * a slow answer is not cut and counted as a failure, and a hung call still ends.
 */
export function breakerCallTimeoutMs(providerTimeoutMs: number): number {
  return providerTimeoutMs + BREAKER_MARGIN_MS;
}

/** Ports a test (or a future adapter) may override when building the app. */
export interface AppModuleOverrides {
  /** The network itself: tests answer Web, Reports and Anthropic with a fake fetch. */
  fetch?: typeof fetch;
  /** Replaces the Anthropic provider (`FINDING_ANALYZER`), e.g. a stub in a test. */
  analyzer?: FindingAnalyzer;
  /** Replaces the Gemini provider, e.g. a stub in a test. */
  geminiAnalyzer?: FindingAnalyzer;
  mockAnalyzer?: FindingAnalyzer;
  /** Overrides the `CB_*` defaults of the breakers (the per tenant + provider one included). */
  breakerOptions?: Partial<CircuitBreakerOptions>;
  /** Injectable clock for the 60 s config cache and the fallback cache. */
  now?: () => number;
}

/**
 * Composition root of the service: the only place that knows concrete implementations.
 * Binds each port token to its adapter and builds the use case with `useFactory` so
 * `application/` and `domain/` stay free of NestJS (ADR 0011).
 */
@Module({})
export class AppModule {
  static register(overrides: AppModuleOverrides = {}): DynamicModule {
    const logger = new Logger(AppModule.name);
    return {
      module: AppModule,
      controllers: [LlmAnalysisController],
      providers: [
        {
          // Every outgoing call (Web for the key, Reports for the result) goes through here:
          // discovery first, static *_URL as a fallback, one circuit breaker per dependency.
          provide: INTERNAL_HTTP,
          useFactory: (config: Config) =>
            new ResilientHttpClient({
              serviceName: 'llm-analysis',
              resolver: createServiceResolver(config),
              internalToken: config.INTERNAL_SERVICE_TOKEN,
              fallbackUrls: { web: config.WEB_URL, reports: config.REPORTS_URL },
              ...(overrides.fetch && { fetch: overrides.fetch }),
            }),
          inject: [APP_CONFIG],
        },
        {
          provide: TENANT_LLM_CONFIG_PROVIDER,
          useFactory: (http: ResilientHttpClient): TenantLlmConfigProvider =>
            new HttpTenantLlmConfigProvider(http, overrides.now),
          inject: [INTERNAL_HTTP],
        },
        {
          provide: FINDING_ANALYZER,
          useFactory: (config: Config): FindingAnalyzer =>
            overrides.analyzer ??
            new AnthropicFindingAnalyzer({
              timeoutMs: config.LLM_PROVIDER_TIMEOUT_MS,
              ...(overrides.fetch && { fetch: overrides.fetch }),
            }),
          inject: [APP_CONFIG],
        },
        {
          provide: GEMINI_FINDING_ANALYZER,
          useFactory: (config: Config): FindingAnalyzer =>
            overrides.geminiAnalyzer ??
            new GeminiFindingAnalyzer({
              timeoutMs: config.LLM_PROVIDER_TIMEOUT_MS,
              ...(overrides.fetch && { fetch: overrides.fetch }),
            }),
          inject: [APP_CONFIG],
        },
        {
          provide: MOCK_FINDING_ANALYZER,
          useValue: overrides.mockAnalyzer ?? new MockFindingAnalyzer(),
        },
        {
          provide: REPORTS_CLIENT,
          useFactory: (http: ResilientHttpClient): ReportsClient => new HttpReportsClient(http),
          inject: [INTERNAL_HTTP],
        },
        {
          // A SINGLETON on purpose: it owns the breaker of each tenant + provider and the fallback
          // cache, which must live as long as the service (a breaker per call would never open).
          provide: MODEL_CALL_POLICY,
          useFactory: (config: Config): ModelCallPolicy =>
            new ResilientModelCallPolicy({
              breakerOptions: {
                // The breaker never gives up before the provider's own timeout does.
                callTimeoutMs: breakerCallTimeoutMs(config.LLM_PROVIDER_TIMEOUT_MS),
                ...overrides.breakerOptions,
              },
              ...(overrides.now && { now: overrides.now }),
            }),
          inject: [APP_CONFIG],
        },
        {
          provide: AnalyzeFindings,
          useFactory: (
            tenantConfig: TenantLlmConfigProvider,
            analyzer: FindingAnalyzer,
            geminiAnalyzer: FindingAnalyzer,
            mockAnalyzer: FindingAnalyzer,
            reports: ReportsClient,
            modelCalls: ModelCallPolicy,
            config: Config,
          ) =>
            new AnalyzeFindings({
              tenantConfig,
              // The providers this service supports, by the tenant's `LlmProvider`. FINDING_ANALYZER
              // is the Anthropic adapter; a new provider adds its entry here, nowhere else.
              analyzers: { anthropic: analyzer, gemini: geminiAnalyzer },
              mockAnalyzer,
              mockEnabled: config.LLM_MOCK_ENABLED,
              reports,
              modelCalls,
              onError: (error, context) =>
                logger.error(
                  `${context} failed: ${error instanceof Error ? error.message : 'unknown error'}`,
                ),
            }),
          inject: [
            TENANT_LLM_CONFIG_PROVIDER,
            FINDING_ANALYZER,
            GEMINI_FINDING_ANALYZER,
            MOCK_FINDING_ANALYZER,
            REPORTS_CLIENT,
            MODEL_CALL_POLICY,
            APP_CONFIG,
          ],
        },
        { provide: BackgroundJobs, useValue: new BackgroundJobs() },
      ],
    };
  }
}
