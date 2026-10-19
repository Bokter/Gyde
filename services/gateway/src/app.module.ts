import type { ServiceResolver } from '@gyde/discovery';
import { APP_CONFIG, type Logger, ResilientHttpClient } from '@gyde/service-kit';
import { type DynamicModule, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { AuthenticateApiKeyUseCase } from './application/use-cases/authenticate-api-key.use-case';
import { EnforceRateLimitUseCase } from './application/use-cases/enforce-rate-limit.use-case';
import { GetReportUseCase } from './application/use-cases/get-report.use-case';
import { API_KEY_VERIFIER, type ApiKeyVerifier } from './application/ports/api-key-verifier';
import { AUTH_CACHE, type AuthCache } from './application/ports/auth-cache';
import { KEY_HASHER, type KeyHasher } from './application/ports/key-hasher';
import { RATE_LIMITER, type RateLimiter } from './application/ports/rate-limiter';
import { REPORT_READER, type ReportReader } from './application/ports/report-reader';
import { REPORTS_CLIENT, type ReportsClient } from './application/ports/reports-client';
import { USAGE_COUNTER, type UsageCounter } from './application/ports/usage-counter';
import { SubmitAnalysisUseCase } from './application/use-cases/submit-analysis.use-case';
import type { Config } from './config';
import { ApiKeyGuard } from './http/api-key.guard';
import { ApplicationErrorInterceptor } from './http/application-error.interceptor';
import { GatewayController } from './http/gateway.controller';
import { RateLimitGuard } from './http/rate-limit.guard';
import { HttpReportsClient } from './infrastructure/adapters/http-reports-client.adapter';
import { MemoryAuthCache } from './infrastructure/adapters/memory-auth-cache.adapter';
import { MemoryRateLimiter } from './infrastructure/adapters/memory-rate-limiter.adapter';
import { MemoryUsageCounter } from './infrastructure/adapters/memory-usage-counter.adapter';
import { createServiceResolver, staticUrls } from './infrastructure/service-resolver';
import { Sha256KeyHasher } from './infrastructure/adapters/sha256-key-hasher.adapter';
import { WebApiKeyVerifier } from './infrastructure/adapters/web-api-key-verifier.adapter';

export interface AppModuleOptions {
  /** Where failures of the neighbours are recorded (never their bodies or the API key). */
  logger?: Logger;
  /** Replaces discovery (`REGISTRY_URL`), e.g. a fake registry in a test. */
  resolver?: ServiceResolver;
  /** Test seams: the network and the clock of the key cache. */
  fetch?: typeof fetch;
  now?: () => number;
}

const INTERNAL_CLIENT = Symbol('ResilientHttpClient');
const HTTP_REPORTS_CLIENT = Symbol('HttpReportsClient');

/**
 * Composition root of the service: the only place that knows concrete implementations.
 * Each port is bound to its adapter here, and the use cases are built with `useFactory` so
 * `application/` stays free of NestJS.
 */
@Module({})
export class AppModule {
  static register(options: AppModuleOptions = {}): DynamicModule {
    return {
      module: AppModule,
      controllers: [GatewayController],
      providers: [
        { provide: APP_INTERCEPTOR, useClass: ApplicationErrorInterceptor },
        ApiKeyGuard,
        RateLimitGuard,
        {
          // Every outgoing call goes through this client: discovery first (the `*_URL` of the
          // environment only as a fallback), one circuit breaker per dependency (`CB_*`) and the
          // internal token on every request.
          provide: INTERNAL_CLIENT,
          useFactory: (config: Config) =>
            new ResilientHttpClient({
              serviceName: 'gateway',
              resolver: options.resolver ?? createServiceResolver(config),
              internalToken: config.INTERNAL_SERVICE_TOKEN,
              fallbackUrls: staticUrls(config),
              ...(options.logger && { logger: options.logger }),
              ...(options.fetch && { fetch: options.fetch }),
            }),
          inject: [APP_CONFIG],
        },
        {
          provide: API_KEY_VERIFIER,
          useFactory: (client: ResilientHttpClient): ApiKeyVerifier =>
            new WebApiKeyVerifier(client),
          inject: [INTERNAL_CLIENT],
        },
        { provide: KEY_HASHER, useFactory: (): KeyHasher => new Sha256KeyHasher() },
        {
          provide: AUTH_CACHE,
          useFactory: (config: Config): AuthCache =>
            new MemoryAuthCache({
              ttlMs: config.API_KEY_CACHE_TTL_MS,
              ...(options.now && { now: options.now }),
            }),
          inject: [APP_CONFIG],
        },
        {
          // One adapter, two ports: starting an analysis and reading one.
          provide: HTTP_REPORTS_CLIENT,
          useFactory: (client: ResilientHttpClient) => new HttpReportsClient(client),
          inject: [INTERNAL_CLIENT],
        },
        {
          provide: REPORTS_CLIENT,
          useFactory: (adapter: HttpReportsClient): ReportsClient => adapter,
          inject: [HTTP_REPORTS_CLIENT],
        },
        {
          provide: REPORT_READER,
          useFactory: (adapter: HttpReportsClient): ReportReader => adapter,
          inject: [HTTP_REPORTS_CLIENT],
        },
        {
          provide: AuthenticateApiKeyUseCase,
          useFactory: (verifier: ApiKeyVerifier, hasher: KeyHasher, cache: AuthCache) =>
            new AuthenticateApiKeyUseCase({ verifier, hasher, cache }),
          inject: [API_KEY_VERIFIER, KEY_HASHER, AUTH_CACHE],
        },
        { provide: USAGE_COUNTER, useFactory: (): UsageCounter => new MemoryUsageCounter() },
        {
          provide: RATE_LIMITER,
          useFactory: (config: Config): RateLimiter =>
            new MemoryRateLimiter({
              limit: config.GATEWAY_RATE_LIMIT_PER_MINUTE,
              ...(options.now && { now: options.now }),
            }),
          inject: [APP_CONFIG],
        },
        {
          provide: EnforceRateLimitUseCase,
          useFactory: (limiter: RateLimiter) => new EnforceRateLimitUseCase(limiter),
          inject: [RATE_LIMITER],
        },
        {
          provide: SubmitAnalysisUseCase,
          useFactory: (reports: ReportsClient, usage: UsageCounter) =>
            new SubmitAnalysisUseCase({ reports, usage, now: options.now ?? Date.now }),
          inject: [REPORTS_CLIENT, USAGE_COUNTER],
        },
        {
          provide: GetReportUseCase,
          useFactory: (reader: ReportReader) => new GetReportUseCase(reader),
          inject: [REPORT_READER],
        },
      ],
    };
  }
}
