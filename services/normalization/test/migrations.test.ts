import { cpSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { resolveMigrationsFolder } from '../src/infrastructure/db/database';
import { runMigrations } from '../src/infrastructure/db/migrate';
import { createPgliteDatabase } from './support/pglite';

/** Rows of a raw query, whichever driver ran it. */
async function rows(
  database: ReturnType<typeof createPgliteDatabase>,
  query: ReturnType<typeof sql>,
) {
  return ((await database.db.execute(query)) as unknown as { rows: Record<string, unknown>[] })
    .rows;
}

describe('SQL migrations', () => {
  it('create the knowledge tables and record each migration once', async () => {
    const database = createPgliteDatabase();
    await database.migrate();
    await database.migrate();

    const tables = await rows(
      database,
      sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`,
    );
    expect(tables.map((row) => row.table_name)).toEqual([
      'ingestion_runs',
      'knowledge_objects',
      'knowledge_packages',
      'schema_migrations',
    ]);
    const applied = await rows(database, sql`select count(*)::int as n from schema_migrations`);
    expect(applied[0]?.n).toBe(
      readdirSync(resolveMigrationsFolder()).filter((f) => f.endsWith('.sql')).length,
    );
    await database.close();
  });

  it('are safe when several instances boot at the same time', async () => {
    const database = createPgliteDatabase();
    await Promise.all([database.migrate(), database.migrate(), database.migrate()]);
    await database.close();
  });

  it('refuse a migration that was edited after it was applied', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'gyde-migrations-'));
    cpSync(resolveMigrationsFolder(), folder, { recursive: true });
    const database = createPgliteDatabase();
    await runMigrations(database.db, folder);

    const file = readdirSync(folder).find((name) => name.endsWith('.sql'));
    writeFileSync(join(folder, file ?? ''), '-- edited\nselect 1;');

    await expect(runMigrations(database.db, folder)).rejects.toThrow(
      'modified after it was applied',
    );
    await database.close();
  });
});
