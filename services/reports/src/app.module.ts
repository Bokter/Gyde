import { Logger, Module, type DynamicModule } from '@nestjs/common';

import {
  ANALYSIS_LIFECYCLE,
  AnalysisLifecycle,
  type LifecycleLogger,
  type TimerName,
} from './application/analysis-lifecycle';
import { REPORT_REPOSITORY, type ReportRepository } from './application/ports/report-repository';
import { RETRIEVAL_CLIENT, type RetrievalClient } from './application/ports/retrieval-client';
import type { Config } from './config';
import { ReportsController } from './http/reports.controller';
import { DATABASE, type DatabaseHandle } from './infrastructure/db/database';
import { HttpRetrievalClient } from './infrastructure/http-retrieval-client';
import { InMemoryReportRepository } from './infrastructure/in-memory-report-repository';
import { PostgresReportRepository } from './infrastructure/postgres-report.repository';
import { ReportsStartup } from './infrastructure/reports-startup';
import { createServiceResolver, staticUrls } from './infrastructure/service-resolver';
import { APP_CONFIG, ResilientHttpClient } from '@gyde/service-kit';

/** Ports a test (or a future adapter) may override when building the app. */
export interface AppModuleOverrides {
  /** Connected database (`main.ts` opens it; tests pass an in-memory one). Absent → in-memory. */
  database?: DatabaseHandle;
  repository?: ReportRepository;
  retrieval?: RetrievalClient;
  /** Injectable for tests to simulate or suppress a timeout; `timer` says which one is being armed. */
  schedule?: (fn: () => void, ms: number, timer?: TimerName) => void;
  /** Receives the watchdog's own failures. Defaults to the Nest logger of the use case. */
  logger?: LifecycleLogger;
  /** Test-only clock; defaults to the real one. */
  now?: () => Date;
  /** Test-only id generator; defaults to `randomUUID`. */
  newId?: () => string;
}

/**
 * Composition root of the service: the only place that knows concrete implementations.
 * Binds each port token to its adapter and builds the use cases with `useFactory` so
 * `application/` and `domain/` stay free of NestJS (ADR 0011).
 *
 * Persistence is chosen here: with a `database` the repository is PostgreSQL (and a startup hook
 * migrates the schema and sweeps stale analyses); without it everything runs in memory.
 */
@Module({ controllers: [ReportsController] })
export class AppModule {
  static withOverrides(overrides: AppModuleOverrides): DynamicModule {
    const { database } = overrides;
    return {
      module: AppModule,
      providers: [
        {
          provide: REPORT_REPOSITORY,
          useValue:
            overrides.repository ??
            (database ? new PostgresReportRepository(database.db) : new InMemoryReportRepository()),
        },
        ...(database ? [{ provide: DATABASE, useValue: database }, ReportsStartup] : []),
        {
          provide: RETRIEVAL_CLIENT,
          useFactory: (config: Config) =>
            overrides.retrieval ??
            new HttpRetrievalClient(
              // Discovery first, the static RETRIEVAL_URL as a fallback, one breaker per dependency.
              new ResilientHttpClient({
                serviceName: 'reports',
                resolver: createServiceResolver(config),
                internalToken: config.INTERNAL_SERVICE_TOKEN,
                fallbackUrls: staticUrls(config),
              }),
            ),
          inject: [APP_CONFIG],
        },
        {
          provide: ANALYSIS_LIFECYCLE,
          useFactory: (repository: ReportRepository, retrieval: RetrievalClient, config: Config) =>
            new AnalysisLifecycle({
              repository,
              retrieval,
              logger: overrides.logger ?? new Logger(AnalysisLifecycle.name),
              aiTimeoutMs: config.REPORTS_AI_TIMEOUT_MS,
              retrievalTimeoutMs: config.REPORTS_RETRIEVAL_TIMEOUT_MS,
              schedule: overrides.schedule,
              now: overrides.now,
              newId: overrides.newId,
            }),
          inject: [REPORT_REPOSITORY, RETRIEVAL_CLIENT, APP_CONFIG],
        },
      ],
      exports: [ANALYSIS_LIFECYCLE],
    };
  }
}
