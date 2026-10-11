import { Logger, Module } from '@nestjs/common';

import {
  ANALYSIS_LIFECYCLE,
  AnalysisLifecycle,
  type LifecycleLogger,
  type TimerName,
} from './application/analysis-lifecycle';
import { REPORT_REPOSITORY, type ReportRepository } from './application/ports/report-repository';
import { RETRIEVAL_CLIENT, type RetrievalClient } from './application/ports/retrieval-client';
import { ReportsController } from './http/reports.controller';
import { HttpRetrievalClient } from './infrastructure/http-retrieval-client';
import { InMemoryReportRepository } from './infrastructure/in-memory-report-repository';
import { APP_CONFIG } from '@gyde/service-kit';
import type { Config } from './config';

/** Ports a test (or a future adapter) may override when building the app. */
export interface AppModuleOverrides {
  repository?: ReportRepository;
  retrieval?: RetrievalClient;
  /** Injectable for tests to simulate or suppress a timeout; `timer` says which one is being armed. */
  schedule?: (fn: () => void, ms: number, timer?: TimerName) => void;
  /** Receives the watchdog's own failures. Defaults to the Nest logger of the use case. */
  logger?: LifecycleLogger;
}

/**
 * Composition root of the service: the only place that knows concrete implementations.
 * Binds each port token to its adapter and builds the use cases with `useFactory` so
 * `application/` and `domain/` stay free of NestJS (ADR 0011).
 */
@Module({ controllers: [ReportsController] })
export class AppModule {
  static withOverrides(overrides: AppModuleOverrides) {
    return {
      module: AppModule,
      providers: [
        {
          provide: REPORT_REPOSITORY,
          useValue: overrides.repository ?? new InMemoryReportRepository(),
        },
        {
          provide: RETRIEVAL_CLIENT,
          useFactory: (config: Config) =>
            overrides.retrieval ??
            new HttpRetrievalClient({
              retrievalUrl: config.RETRIEVAL_URL ?? 'http://localhost:4300',
              internalToken: config.INTERNAL_SERVICE_TOKEN,
            }),
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
            }),
          inject: [REPORT_REPOSITORY, RETRIEVAL_CLIENT, APP_CONFIG],
        },
      ],
      exports: [ANALYSIS_LIFECYCLE],
    };
  }
}
