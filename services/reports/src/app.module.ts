import { randomUUID } from 'node:crypto';

import { APP_CONFIG, ResilientHttpClient } from '@gyde/service-kit';
import { Logger, Module, type DynamicModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import {
  ANALYSIS_WATCHDOG,
  AnalysisWatchdog,
  type TimerName,
  type WatchdogLogger,
} from './application/analysis-watchdog';
import {
  CREATE_ANALYSIS,
  CreateAnalysisUseCase,
} from './application/use-cases/create-analysis.use-case';
import { GET_REPORT, GetReportUseCase } from './application/use-cases/get-report.use-case';
import {
  GET_REPORT_MARKDOWN,
  GetReportMarkdownUseCase,
} from './application/use-cases/get-report-markdown.use-case';
import { REPORT_REPOSITORY, type ReportRepository } from './application/ports/report-repository';
import { RETRIEVAL_CLIENT, type RetrievalClient } from './application/ports/retrieval-client';
import {
  RECORD_AI_RESULT,
  RecordAiResultUseCase,
} from './application/use-cases/record-ai-result.use-case';
import {
  RECORD_ANALYSIS_FAILURE,
  RecordAnalysisFailureUseCase,
} from './application/use-cases/record-analysis-failure.use-case';
import {
  RECORD_DETERMINISTIC_RESULT,
  RecordDeterministicResultUseCase,
} from './application/use-cases/record-deterministic-result.use-case';
import {
  SWEEP_STALE_ANALYSES,
  SweepStaleAnalysesUseCase,
} from './application/use-cases/sweep-stale-analyses.use-case';
import type { Config } from './config';
import { ApplicationErrorInterceptor } from './http/application-error.interceptor';
import { ReportsController } from './http/reports.controller';
import { DATABASE, type DatabaseHandle } from './infrastructure/db/database';
import { HttpRetrievalClient } from './infrastructure/http-retrieval-client';
import { InMemoryReportRepository } from './infrastructure/in-memory-report-repository';
import { PostgresReportRepository } from './infrastructure/postgres-report.repository';
import { ReportsStartup } from './infrastructure/reports-startup';
import { createServiceResolver, staticUrls } from './infrastructure/service-resolver';

/** Ports a test (or a future adapter) may override when building the app. */
export interface AppModuleOverrides {
  /** Connected database (`main.ts` opens it; tests pass an in-memory one). Absent → in-memory. */
  database?: DatabaseHandle;
  repository?: ReportRepository;
  retrieval?: RetrievalClient;
  /** Injectable for tests to simulate or suppress a timeout; `timer` says which one is being armed. */
  schedule?: (fn: () => void, ms: number, timer?: TimerName) => void;
  /** Receives the watchdog's own failures. Defaults to the Nest logger of the watchdog. */
  logger?: WatchdogLogger;
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
        { provide: APP_INTERCEPTOR, useClass: ApplicationErrorInterceptor },
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
          provide: ANALYSIS_WATCHDOG,
          useFactory: (repository: ReportRepository, config: Config) =>
            new AnalysisWatchdog(repository, {
              schedule:
                overrides.schedule ??
                ((fn, ms) => {
                  setTimeout(fn, ms);
                }),
              logger: overrides.logger ?? new Logger('AnalysisWatchdog'),
              now: overrides.now,
              aiTimeoutMs: config.REPORTS_AI_TIMEOUT_MS,
              retrievalTimeoutMs: config.REPORTS_RETRIEVAL_TIMEOUT_MS,
            }),
          inject: [REPORT_REPOSITORY, APP_CONFIG],
        },
        {
          provide: CREATE_ANALYSIS,
          useFactory: (
            repository: ReportRepository,
            retrieval: RetrievalClient,
            watchdog: AnalysisWatchdog,
          ) =>
            new CreateAnalysisUseCase(repository, retrieval, watchdog, {
              newId: overrides.newId ?? (() => randomUUID()),
              now: overrides.now,
            }),
          inject: [REPORT_REPOSITORY, RETRIEVAL_CLIENT, ANALYSIS_WATCHDOG],
        },
        {
          provide: RECORD_DETERMINISTIC_RESULT,
          useFactory: (repository: ReportRepository, watchdog: AnalysisWatchdog) =>
            new RecordDeterministicResultUseCase(repository, watchdog, { now: overrides.now }),
          inject: [REPORT_REPOSITORY, ANALYSIS_WATCHDOG],
        },
        {
          provide: RECORD_AI_RESULT,
          useFactory: (repository: ReportRepository) =>
            new RecordAiResultUseCase(repository, { now: overrides.now }),
          inject: [REPORT_REPOSITORY],
        },
        {
          provide: RECORD_ANALYSIS_FAILURE,
          useFactory: (repository: ReportRepository) =>
            new RecordAnalysisFailureUseCase(repository, { now: overrides.now }),
          inject: [REPORT_REPOSITORY],
        },
        {
          provide: GET_REPORT,
          useFactory: (repository: ReportRepository) => new GetReportUseCase(repository),
          inject: [REPORT_REPOSITORY],
        },
        {
          provide: GET_REPORT_MARKDOWN,
          useFactory: (getReport: GetReportUseCase) => new GetReportMarkdownUseCase(getReport),
          inject: [GET_REPORT],
        },
        {
          provide: SWEEP_STALE_ANALYSES,
          useFactory: (repository: ReportRepository, config: Config) =>
            new SweepStaleAnalysesUseCase(repository, {
              aiTimeoutMs: config.REPORTS_AI_TIMEOUT_MS,
              retrievalTimeoutMs: config.REPORTS_RETRIEVAL_TIMEOUT_MS,
              now: overrides.now,
            }),
          inject: [REPORT_REPOSITORY, APP_CONFIG],
        },
      ],
      exports: [
        CREATE_ANALYSIS,
        RECORD_DETERMINISTIC_RESULT,
        RECORD_AI_RESULT,
        RECORD_ANALYSIS_FAILURE,
        GET_REPORT,
        GET_REPORT_MARKDOWN,
        SWEEP_STALE_ANALYSES,
      ],
    };
  }
}
