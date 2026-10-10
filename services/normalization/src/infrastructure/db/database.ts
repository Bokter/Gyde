import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';

import { runMigrations } from './migrate';
import * as schema from './schema';

/** Driver-agnostic Drizzle database: node-postgres in production, PGlite in tests. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

/** A database plus the lifecycle operations the composition root needs. */
export interface DatabaseHandle {
  readonly db: Database;
  /** Applies the pending SQL migrations. Idempotent: safe on every start. */
  migrate(): Promise<void>;
  /** Cheap round trip, for readiness checks. */
  ping(): Promise<void>;
  close(): Promise<void>;
}

/** DI token of the `DatabaseHandle` (infrastructure detail, not an application port). */
export const DATABASE = Symbol('DatabaseHandle');

/**
 * Where drizzle-kit writes the SQL migrations (`services/normalization/drizzle`). The code runs
 * from `src/infrastructure/db/` (tests, tsx) and from the bundle `dist/main.js` (production).
 */
export function resolveMigrationsFolder(): string {
  const candidates = ['../../../drizzle', '../drizzle'].map((relative) =>
    fileURLToPath(new URL(relative, import.meta.url)),
  );
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`Migrations folder not found (looked in ${candidates.join(', ')})`);
  return found;
}

export function connectPostgres(connectionString: string): DatabaseHandle {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return {
    db,
    migrate: () => runMigrations(db, resolveMigrationsFolder()),
    ping: async () => {
      await db.execute(sql`select 1`);
    },
    close: () => pool.end(),
  };
}
