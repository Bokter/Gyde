import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import type { Database } from './database';

/**
 * Applies the SQL files that drizzle-kit generates (`pnpm db:generate`), in journal order.
 *
 * Why not drizzle's own migrator: it runs `CREATE SCHEMA IF NOT EXISTS` and keeps its journal in
 * another schema, and the `reports` role is not allowed to create schemas (ADR 0009). Here
 * the journal table lives in the role's own schema (its `search_path`).
 *
 * Safe on every start and with several instances booting together: everything runs in one
 * transaction behind an advisory lock, already applied files are skipped, and a file edited after
 * it was applied is refused (write a new migration instead).
 */
const schemaMigrations = pgTable('schema_migrations', {
  name: text('name').primaryKey(),
  checksum: text('checksum').notNull(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
});

interface Journal {
  entries: { tag: string }[];
}

export async function runMigrations(db: Database, folder: string): Promise<void> {
  const journal = JSON.parse(
    readFileSync(join(folder, 'meta', '_journal.json'), 'utf8'),
  ) as Journal;

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(7241002)`);
    await tx.execute(sql`
      create table if not exists schema_migrations (
        name text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )`);
    const applied = new Map(
      (await tx.select().from(schemaMigrations)).map((row) => [row.name, row.checksum]),
    );

    for (const { tag } of journal.entries) {
      const file = readFileSync(join(folder, `${tag}.sql`), 'utf8');
      const checksum = createHash('sha256').update(file).digest('hex');

      const previous = applied.get(tag);
      if (previous !== undefined) {
        if (previous !== checksum) {
          throw new Error(`Migration ${tag} was modified after it was applied`);
        }
        continue;
      }
      for (const statement of file.split('--> statement-breakpoint')) {
        if (statement.trim()) await tx.execute(sql.raw(statement));
      }
      await tx.insert(schemaMigrations).values({ name: tag, checksum });
    }
  });
}
