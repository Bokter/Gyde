import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';

import { resolveMigrationsFolder, type DatabaseHandle } from '../../src/infrastructure/db/database';
import { runMigrations } from '../../src/infrastructure/db/migrate';
import * as schema from '../../src/infrastructure/db/schema';

/** In-memory PostgreSQL (real SQL engine, no Docker, no network) with the production migrations. */
export function createPgliteDatabase(): DatabaseHandle {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  return {
    db,
    migrate: () => runMigrations(db, resolveMigrationsFolder()),
    ping: async () => {
      await db.execute(sql`select 1`);
    },
    close: () => client.close(),
  };
}
