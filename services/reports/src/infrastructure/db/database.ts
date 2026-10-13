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
 * Where drizzle-kit writes the SQL migrations (`services/reports/drizzle`). The code runs
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

/**
 * The connection pool. An idle connection can be cut by the server (restart, failover, a network
 * blip): `pg` then emits `error` on the pool, and with no listener Node treats it as an uncaught
 * exception and the whole service dies. The pool already discards that client and opens another
 * on the next query, so the right reaction is to note it and carry on.
 */
export function createPool(connectionString: string, onError?: (error: Error) => void): Pool {
  const pool = new Pool({ connectionString });
  pool.on('error', (error) => onError?.(error));
  return pool;
}

export function connectPostgres(
  connectionString: string,
  onError?: (error: Error) => void,
): DatabaseHandle {
  const pool = createPool(connectionString, onError);
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
