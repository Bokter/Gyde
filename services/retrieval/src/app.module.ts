import {
  CircuitBreaker,
  type CircuitBreakerOptions,
  MemoryFallbackCache,
  createBreakerFromEnv,
} from '@gyde/resilience';
import type { KnowledgeQueryResult } from '@gyde/contracts';
import type { ServiceResolver } from '@gyde/discovery';
import { APP_CONFIG } from '@gyde/service-kit';
import { type DynamicModule, Logger, Module } from '@nestjs/common';

import { BackgroundJobs } from './application/background-jobs';
import { LLM_CLIENT, REPORTS_CLIENT } from './application/ports/downstream';
import type { LlmClient, ReportsClient } from './application/ports/downstream';
import { KNOWLEDGE_SOURCE, type KnowledgeSource } from './application/ports/knowledge-source';
import { RetrieveEvidence } from './application/retrieve-evidence';
import type { Config } from './config';
import { LicenseAnalyzer } from './domain/analyzers/licenses/license-analyzer';
import { VulnerabilityAnalyzer } from './domain/analyzers/vulnerabilities/vulnerability-analyzer';
import { RetrievalController } from './http/retrieval.controller';
import { HttpKnowledgeSource } from './infrastructure/http-knowledge-source';
import { HttpLlmClient } from './infrastructure/http-llm-client';
import { HttpReportsClient } from './infrastructure/http-reports-client';
import { InternalHttpClient } from './infrastructure/internal-http-client';
import { ServiceLocator } from './infrastructure/service-locator';

export interface AppModuleOptions {
  /** Service Registry client. Absent until it is wired: the static `*_URL` are used. */
  resolver?: ServiceResolver;
  /** Test seams: the network, the pause between retries and settings that override the `CB_*` of the breakers. */
  fetch?: typeof fetch;
  breakerOverrides?: Partial<CircuitBreakerOptions>;
  sleep?: (ms: number) => Promise<void>;
}

const INTERNAL_CLIENT = Symbol('InternalHttpClient');

/**
 * Composition root of the service: the only place that knows concrete implementations.
 * Each port is bound to its adapter here, and the use case is built with `useFactory` so
 * `application/` and `domain/` stay free of NestJS.
 */
@Module({})
export class AppModule {
  static register(options: AppModuleOptions = {}): DynamicModule {
    const breakerOptions = (name: string): CircuitBreakerOptions => ({
      ...createBreakerFromEnv(name),
      ...options.breakerOverrides,
    });
    return {
      module: AppModule,
      controllers: [RetrievalController],
      providers: [
        {
          // Every outgoing call goes through this client: one circuit breaker per dependency and
          // addresses from discovery (the `*_URL` of the environment only as a fallback).
          provide: INTERNAL_CLIENT,
          useFactory: (config: Config) =>
            new InternalHttpClient({
              locator: new ServiceLocator({
                ...(options.resolver && { resolver: options.resolver }),
                staticUrls: {
                  normalization: config.NORMALIZATION_URL,
                  'llm-analysis': config.LLM_ANALYSIS_URL,
                  reports: config.REPORTS_URL,
                },
              }),
              internalToken: config.INTERNAL_SERVICE_TOKEN,
              breakers: {
                normalization: new CircuitBreaker(breakerOptions('retrieval->normalization')),
                'llm-analysis': new CircuitBreaker(breakerOptions('retrieval->llm-analysis')),
                reports: new CircuitBreaker(breakerOptions('retrieval->reports')),
              },
              ...(options.fetch && { fetch: options.fetch }),
            }),
          inject: [APP_CONFIG],
        },
        {
          provide: KNOWLEDGE_SOURCE,
          useFactory: (client: InternalHttpClient): KnowledgeSource =>
            new HttpKnowledgeSource(
              client,
              new MemoryFallbackCache<KnowledgeQueryResult>({ maxEntries: 200, ttlMs: 3_600_000 }),
            ),
          inject: [INTERNAL_CLIENT],
        },
        {
          provide: REPORTS_CLIENT,
          useFactory: (client: InternalHttpClient): ReportsClient =>
            new HttpReportsClient(client, options.sleep ? { sleep: options.sleep } : {}),
          inject: [INTERNAL_CLIENT],
        },
        {
          provide: LLM_CLIENT,
          useFactory: (client: InternalHttpClient): LlmClient => new HttpLlmClient(client),
          inject: [INTERNAL_CLIENT],
        },
        {
          provide: RetrieveEvidence,
          useFactory: (knowledge: KnowledgeSource, reports: ReportsClient, llm: LlmClient) => {
            const logger = new Logger(RetrieveEvidence.name);
            return new RetrieveEvidence({
              knowledge,
              reports,
              llm,
              analyzers: [new VulnerabilityAnalyzer(), new LicenseAnalyzer()],
              onError: (error, { analysisId, step }) =>
                logger.warn(
                  `${step} failed for ${analysisId}: ${error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error'}`,
                ),
            });
          },
          inject: [KNOWLEDGE_SOURCE, REPORTS_CLIENT, LLM_CLIENT],
        },
        { provide: BackgroundJobs, useValue: new BackgroundJobs() },
      ],
    };
  }
}
