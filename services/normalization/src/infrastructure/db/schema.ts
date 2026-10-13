import type { AffectedRange } from '@gyde/contracts';
import { sql } from 'drizzle-orm';
import {
  bigint,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * Tables of the `normalization` schema. They are declared WITHOUT a schema qualifier on purpose:
 * the service role has `search_path = normalization` (ADR 0009), so the same code works against
 * the shared PostgreSQL and against an in-memory database in tests.
 *
 * After `pnpm db:generate`, remove the `"public".` qualifier drizzle-kit writes into the
 * FOREIGN KEY of the SQL file (it would point at the wrong schema), as `0000` already shows.
 */

/** One row per `KnowledgeObject`, keyed by its stable id ("<source>:<id in the source>"). */
export const knowledgeObjects = pgTable(
  'knowledge_objects',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    source: text('source').notNull(),
    sourceKind: text('source_kind').notNull(),
    trust: text('trust').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull().default(''),
    aliases: text('aliases')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    severity: text('severity'),
    cvss: doublePrecision('cvss'),
    affected: jsonb('affected')
      .$type<AffectedRange[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    gameEngines: text('game_engines')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    url: text('url'),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    modifiedAt: timestamp('modified_at', { withTimezone: true, mode: 'date' }),
    ingestedAt: timestamp('ingested_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [
    index('knowledge_objects_source_idx').on(table.source),
    index('knowledge_objects_kind_idx').on(table.kind),
  ],
);

/**
 * Makes `affected` queryable: one row per (object, ecosystem, package) mentioned by the object.
 * `name_key` is the lower-cased package name (NuGet and vcpkg names are case-insensitive); the
 * exact, version-aware match is Retrieval's job.
 */
export const knowledgePackages = pgTable(
  'knowledge_packages',
  {
    objectId: text('object_id')
      .notNull()
      .references(() => knowledgeObjects.id, { onDelete: 'cascade' }),
    ecosystem: text('ecosystem').notNull(),
    nameKey: text('name_key').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.objectId, table.ecosystem, table.nameKey] }),
    index('knowledge_packages_lookup_idx').on(table.ecosystem, table.nameKey),
  ],
);

/** One row per ingestion attempt of a source; drives `lastIngestedAt` and `GET /internal/sources`. */
export const ingestionRuns = pgTable(
  'ingestion_runs',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    source: text('source').notNull(),
    status: text('status').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }).notNull(),
    recordsProcessed: integer('records_processed').notNull().default(0),
    error: text('error'),
  },
  (table) => [index('ingestion_runs_source_idx').on(table.source, table.finishedAt)],
);
