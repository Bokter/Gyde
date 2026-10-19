import { CircuitBreaker, createBreakerFromEnv } from '@gyde/resilience';
import { APP_CONFIG } from '@gyde/service-kit';
import { type DynamicModule, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { IngestSourceUseCase } from './application/use-cases/ingest-source.use-case';
import { ListSourcesUseCase } from './application/use-cases/list-sources.use-case';
import { QueryKnowledgeUseCase } from './application/use-cases/query-knowledge.use-case';
import {
  KNOWLEDGE_REPOSITORY,
  type KnowledgeRepository,
} from './domain/repositories/knowledge.repository';
import { SOURCE_ADAPTERS, type SourceAdapter } from './application/ports/source-adapter';
import type { Config } from './config';
import { ApplicationErrorInterceptor } from './http/application-error.interceptor';
import { NormalizationController } from './http/normalization.controller';
import { DATABASE, type DatabaseHandle } from './infrastructure/db/database';
import { DatabaseLifecycle } from './infrastructure/db/database-lifecycle';
import { PostgresKnowledgeRepository } from './infrastructure/repositories/postgres-knowledge.repository';
import { OsvAdapter } from './infrastructure/sources/structured/osv.adapter';

export interface AppModuleOptions {
  /** The PostgreSQL connection (`main.ts` opens it; tests pass an in-memory database). */
  database: DatabaseHandle;
  /** Test seam: replaces the source adapters. `main.ts` never passes it. */
  adapters?: SourceAdapter[];
}

/**
 * Composition root of the service: the only place that knows concrete implementations.
 * Each port is bound to its adapter here, and the use cases are built with `useFactory` so
 * `application/` and `domain/` stay free of NestJS.
 */
@Module({})
export class AppModule {
  static register({ database, adapters }: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      controllers: [NormalizationController],
      providers: [
        { provide: APP_INTERCEPTOR, useClass: ApplicationErrorInterceptor },
        { provide: DATABASE, useValue: database },
        DatabaseLifecycle,
        { provide: KNOWLEDGE_REPOSITORY, useClass: PostgresKnowledgeRepository },
        {
          // One adapter per source; each owns its own circuit breaker (a source that is down
          // must not stop the others).
          provide: SOURCE_ADAPTERS,
          useFactory: (config: Config): SourceAdapter[] =>
            adapters ?? [
              new OsvAdapter({
                useFixtures: config.INGEST_USE_FIXTURES,
                fixturesDir: config.INGEST_FIXTURES_DIR,
                apiUrl: config.OSV_API_URL,
                bucketUrl: config.OSV_BUCKET_URL,
                breaker: new CircuitBreaker(createBreakerFromEnv('normalization->osv')),
              }),
            ],
          inject: [APP_CONFIG],
        },
        {
          provide: QueryKnowledgeUseCase,
          useFactory: (repository: KnowledgeRepository) => new QueryKnowledgeUseCase(repository),
          inject: [KNOWLEDGE_REPOSITORY],
        },
        {
          provide: ListSourcesUseCase,
          useFactory: (adapters: SourceAdapter[], repository: KnowledgeRepository) =>
            new ListSourcesUseCase({ adapters, repository }),
          inject: [SOURCE_ADAPTERS, KNOWLEDGE_REPOSITORY],
        },
        {
          provide: IngestSourceUseCase,
          useFactory: (adapters: SourceAdapter[], repository: KnowledgeRepository) =>
            new IngestSourceUseCase({ adapters, repository }),
          inject: [SOURCE_ADAPTERS, KNOWLEDGE_REPOSITORY],
        },
      ],
    };
  }
}
