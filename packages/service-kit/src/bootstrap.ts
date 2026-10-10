import { randomUUID } from 'node:crypto';

import { HEADERS } from '@gyde/contracts';
import { type DynamicModule, Global, Module, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyHttpOptions } from 'fastify';

import { ApiExceptionFilter } from './api-exception.filter';
import { HealthModule } from './health.module';
import { internalTokenHook } from './internal-auth';
import type { Logger } from './logger';
import { PinoNestLogger } from './nest-logger';
import { APP_CONFIG } from './tokens';

export interface ServiceOptions {
  /** Service name, e.g. "gateway". Shown in health checks and logs. */
  name: string;
  version?: string;
  logger: Logger;
  /** The validated configuration; provided globally under the `APP_CONFIG` token. */
  config?: unknown;
  /** Readiness checks (database, registry…): `/readyz` answers 503 while any of them fails. */
  readiness?: Record<string, () => Promise<unknown>>;
  /**
   * When set, every request whose path starts with one of `internalPrefixes` must carry this
   * `x-internal-token`, including paths that do not exist.
   */
  internalToken?: string;
  /** Defaults to `['/internal/']`. The registry guards `['/v1/']`. */
  internalPrefixes?: readonly string[];
  /** Max request body in bytes. Defaults to 1 MiB (an AnalysisRequest is far below that). */
  bodyLimit?: number;
}

@Global()
@Module({})
class ServiceKitModule {
  static register(config: unknown): DynamicModule {
    return {
      module: ServiceKitModule,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}

@Module({})
class RootModule {}

/**
 * Builds the NestJS application every Gyde service starts from, on the Fastify adapter:
 * request ids, the standard error envelope, `/healthz` and `/readyz`, the internal-token guard and
 * a redacting logger. Pass the service's own module (controllers and providers).
 * Call `startService` to listen; in tests use `app.inject(...)` directly.
 */
export async function createService(
  appModule: Type<unknown> | DynamicModule,
  options: ServiceOptions,
): Promise<NestFastifyApplication> {
  const {
    name,
    version = '0.0.0',
    logger,
    config,
    readiness = {},
    internalToken,
    internalPrefixes = ['/internal/'],
    bodyLimit = 1_048_576,
  } = options;

  const fastifyOptions = {
    loggerInstance: logger,
    requestIdHeader: HEADERS.requestId,
    genReqId: () => randomUUID(),
    bodyLimit,
  } as FastifyHttpOptions<never>;

  const app = await NestFactory.create<NestFastifyApplication>(
    {
      module: RootModule,
      imports: [
        ServiceKitModule.register(config),
        HealthModule.register({ name, version, readiness }),
        appModule,
      ],
    },
    new FastifyAdapter(fastifyOptions),
    { logger: new PinoNestLogger(logger) },
  );

  app.useGlobalFilters(new ApiExceptionFilter());

  // Hooks go on the Fastify instance (not on Nest guards) so they also cover unknown paths.
  const fastify = app.getHttpAdapter().getInstance();
  if (internalToken) {
    fastify.addHook('onRequest', internalTokenHook(internalToken, internalPrefixes));
  }
  fastify.addHook('onSend', async (request, reply) => {
    reply.header(HEADERS.requestId, request.id);
  });

  await app.init();
  await fastify.ready();
  return app;
}
