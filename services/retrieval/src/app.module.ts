import { MemoryFallbackCache } from '@gyde/resilience';
import type { KnowledgeQueryResult } from '@gyde/contracts';
import type { ServiceResolver } from '@gyde/discovery';
import { APP_CONFIG, ResilientHttpClient } from '@gyde/service-kit';
import { type DynamicModule, Logger, Module } from '@nestjs/common';

import { BackgroundJobs } from './application/background-jobs';
import { LLM_CLIENT, REPORTS_CLIENT } from './application/ports/downstream';
import type { LlmClient, ReportsClient } from './application/ports/downstream';
import { KNOWLEDGE_SOURCE, type KnowledgeSource } from './application/ports/knowledge-source';
import { RetrieveEvidenceUseCase } from './application/use-cases/retrieve-evidence.use-case';
import type { Config } from './config';
import { LicenseAnalyzer } from './domain/analyzers/licenses/license-analyzer';
import { VulnerabilityAnalyzer } from './domain/analyzers/vulnerabilities/vulnerability-analyzer';
import { RetrievalController } from './http/retrieval.controller';
import { HttpKnowledgeSource } from './infrastructure/adapters/http-knowledge-source.adapter';
import { HttpLlmClient } from './infrastructure/adapters/http-llm-client.adapter';
import { HttpReportsClient } from './infrastructure/adapters/http-reports-client.adapter';
import { sha256Hex } from './infrastructure/adapters/sha256-hex.adapter';
import { SpdxLicenseExpressionParser } from './infrastructure/adapters/spdx-license-expression-parser.adapter';
import { createServiceResolver, staticUrls } from './infrastructure/service-resolver';

export interface AppModuleOptions {
  /** Replaces discovery (`REGISTRY_URL`), e.g. a fake registry in a test. */
  resolver?: ServiceResolver;
  /** Test seams: the network and the pause between retries. */
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const INTERNAL_CLIENT = Symbol('ResilientHttpClient');

/**
 * Composition root of the service: the only place that knows concrete implementations.
 * Each port is bound to its adapter here, and the use case is built with `useFactory` so
 * `application/` and `domain/` stay free of NestJS.
 */
@Module({})
export class AppModule {
  static register(options: AppModuleOptions = {}): DynamicModule {
    return {
      module: AppModule,
      controllers: [RetrievalController],
      providers: [
        {
          // Every outgoing call goes through this client: discovery first (the `*_URL` of the
          // environment only as a fallback), one circuit breaker per dependency (`CB_*`) and the
          // internal token on every request.
          provide: INTERNAL_CLIENT,
          useFactory: (config: Config) =>
            new ResilientHttpClient({
              serviceName: 'retrieval',
              resolver: options.resolver ?? createServiceResolver(config),
              internalToken: config.INTERNAL_SERVICE_TOKEN,
              fallbackUrls: staticUrls(config),
              ...(options.fetch && { fetch: options.fetch }),
            }),
          inject: [APP_CONFIG],
        },
        {
          provide: KNOWLEDGE_SOURCE,
          useFactory: (client: ResilientHttpClient): KnowledgeSource =>
            new HttpKnowledgeSource(
              client,
              new MemoryFallbackCache<KnowledgeQueryResult>({ maxEntries: 200, ttlMs: 3_600_000 }),
            ),
          inject: [INTERNAL_CLIENT],
        },
        {
          provide: REPORTS_CLIENT,
          useFactory: (client: ResilientHttpClient): ReportsClient =>
            new HttpReportsClient(client, options.sleep ? { sleep: options.sleep } : {}),
          inject: [INTERNAL_CLIENT],
        },
        {
          provide: LLM_CLIENT,
          useFactory: (client: ResilientHttpClient): LlmClient => new HttpLlmClient(client),
          inject: [INTERNAL_CLIENT],
        },
        {
          provide: RetrieveEvidenceUseCase,
          useFactory: (knowledge: KnowledgeSource, reports: ReportsClient, llm: LlmClient) => {
            const logger = new Logger(RetrieveEvidenceUseCase.name);
            return new RetrieveEvidenceUseCase({
              knowledge,
              reports,
              llm,
              analyzers: [
                new VulnerabilityAnalyzer(sha256Hex),
                new LicenseAnalyzer(new SpdxLicenseExpressionParser(), sha256Hex),
              ],
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
