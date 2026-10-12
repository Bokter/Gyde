import type { ServiceResolver } from '@gyde/discovery';
import { APP_CONFIG, type Logger, ResilientHttpClient } from '@gyde/service-kit';
import { type DynamicModule, Module } from '@nestjs/common';

import { AuthenticateApiKey } from './application/authenticate-api-key';
import { GetReport } from './application/get-report';
import { API_KEY_VERIFIER, type ApiKeyVerifier } from './application/ports/api-key-verifier';
import { AUTH_CACHE, type AuthCache } from './application/ports/auth-cache';
import { KEY_HASHER, type KeyHasher } from './application/ports/key-hasher';
import { REPORTS_CLIENT, type ReportsClient } from './application/ports/reports-client';
import { SubmitAnalysis } from './application/submit-analysis';
import type { Config } from './config';
import { ApiKeyGuard } from './http/api-key.guard';
import { GatewayController } from './http/gateway.controller';
import { HttpReportsClient } from './infrastructure/http-reports-client';
import { MemoryAuthCache } from './infrastructure/memory-auth-cache';
import { createServiceResolver, staticUrls } from './infrastructure/service-resolver';
import { Sha256KeyHasher } from './infrastructure/sha256-key-hasher';
import { WebApiKeyVerifier } from './infrastructure/web-api-key-verifier';

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
        ApiKeyGuard,
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
          provide: REPORTS_CLIENT,
          useFactory: (client: ResilientHttpClient): ReportsClient => new HttpReportsClient(client),
          inject: [INTERNAL_CLIENT],
        },
        {
          provide: AuthenticateApiKey,
          useFactory: (verifier: ApiKeyVerifier, hasher: KeyHasher, cache: AuthCache) =>
            new AuthenticateApiKey({ verifier, hasher, cache }),
          inject: [API_KEY_VERIFIER, KEY_HASHER, AUTH_CACHE],
        },
        {
          provide: SubmitAnalysis,
          useFactory: (reports: ReportsClient) => new SubmitAnalysis(reports),
          inject: [REPORTS_CLIENT],
        },
        {
          provide: GetReport,
          useFactory: (reports: ReportsClient) => new GetReport(reports),
          inject: [REPORTS_CLIENT],
        },
      ],
    };
  }
}
