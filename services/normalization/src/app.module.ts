import { APP_CONFIG } from '@gyde/service-kit';
import { type DynamicModule, Module } from '@nestjs/common';

import { KNOWLEDGE_REPOSITORY } from './application/ports/knowledge-repository';
import type { Config } from './config';
import { NormalizationController } from './http/normalization.controller';
import { DATABASE, type DatabaseHandle, connectPostgres } from './infrastructure/db/database';
import { DatabaseLifecycle } from './infrastructure/db/database-lifecycle';
import { PostgresKnowledgeRepository } from './infrastructure/postgres-knowledge.repository';

export interface AppModuleOptions {
  /** Replaces the PostgreSQL connection (tests pass an in-memory database). */
  database?: DatabaseHandle;
}

/**
 * Composition root of the service: the only place that knows concrete implementations.
 * Each port is bound to its adapter here, and the use cases are built with `useFactory` so
 * `application/` and `domain/` stay free of NestJS.
 */
@Module({})
export class AppModule {
  static register(options: AppModuleOptions = {}): DynamicModule {
    return {
      module: AppModule,
      controllers: [NormalizationController],
      providers: [
        {
          provide: DATABASE,
          useFactory: (config: Config): DatabaseHandle => {
            if (options.database) return options.database;
            if (!config.NORMALIZATION_DATABASE_URL) {
              throw new Error('NORMALIZATION_DATABASE_URL is required to start the service');
            }
            return connectPostgres(config.NORMALIZATION_DATABASE_URL);
          },
          inject: [APP_CONFIG],
        },
        DatabaseLifecycle,
        { provide: KNOWLEDGE_REPOSITORY, useClass: PostgresKnowledgeRepository },
      ],
    };
  }
}
