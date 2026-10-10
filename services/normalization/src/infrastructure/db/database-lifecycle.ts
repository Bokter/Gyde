import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { DATABASE, type DatabaseHandle } from './database';

/**
 * Migrates the schema before the service listens (Nest awaits `onModuleInit` during `init()`)
 * and releases the connection pool on shutdown.
 */
@Injectable()
export class DatabaseLifecycle implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  onModuleInit(): Promise<void> {
    return this.database.migrate();
  }

  onModuleDestroy(): Promise<void> {
    return this.database.close();
  }
}
