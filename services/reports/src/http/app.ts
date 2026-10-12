import { type Logger, type NestFastifyApplication, createService } from '@gyde/service-kit';

import { AppModule, type AppModuleOverrides } from '../app.module';
import type { Config } from '../config';

export interface AppDeps {
  config: Config;
  logger: Logger;
  /**
   * Connected database (PostgreSQL in production, PGlite in tests); its type comes from the
   * composition root, because `http/` must not import `infrastructure/` (ADR 0011).
   * None → the service runs with the in-memory repository.
   */
  database?: AppModuleOverrides['database'];
  /** Test-only: replace the default adapters (repository, retrieval) with fakes. */
  overrides?: AppModuleOverrides;
}

/** Builds the NestJS application of the reports service (not listening yet: see `main.ts`). */
export function createApp({
  config,
  logger,
  database,
  overrides = {},
}: AppDeps): Promise<NestFastifyApplication> {
  return createService(AppModule.withOverrides({ database, ...overrides }), {
    name: 'reports',
    logger,
    config,
    internalToken: config.INTERNAL_SERVICE_TOKEN,
    // With persistence, /readyz answers 503 while the database is unreachable.
    ...(database ? { readiness: { database: () => database.ping() } } : {}),
  });
}
