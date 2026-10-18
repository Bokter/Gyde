import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import {
  SWEEP_STALE_ANALYSES,
  type SweepStaleAnalysesUseCase,
} from '../application/use-cases/sweep-stale-analyses.use-case';
import { DATABASE, type DatabaseHandle } from './db/database';

/**
 * Runs before the service listens (NestJS awaits `onModuleInit` during `app.init()`), in a single
 * hook so the order is deterministic: migrations first, then the sweep that closes the analyses a
 * previous run left in progress. Also releases the connection pool on shutdown.
 *
 * Only registered when there is a database: without persistence there is nothing to migrate and
 * nothing to sweep (the in-memory store starts empty and the timers run in this process).
 */
@Injectable()
export class ReportsStartup implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportsStartup.name);

  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    @Inject(SWEEP_STALE_ANALYSES) private readonly sweepStaleAnalyses: SweepStaleAnalysesUseCase,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.database.migrate();
    this.logger.log('database migrations applied');

    // A failure here is a broken schema or an unreachable database: fail fast, do not listen.
    const swept = await this.sweepStaleAnalyses.execute();
    if (swept.analyzing > 0 || swept.retrieving > 0) {
      this.logger.log(
        `startup sweep closed ${swept.analyzing} stale analyzing and ${swept.retrieving} stale retrieving analyses`,
      );
    }
  }

  onModuleDestroy(): Promise<void> {
    return this.database.close();
  }
}
