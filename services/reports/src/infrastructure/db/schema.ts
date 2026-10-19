import type {
  AiResult,
  AnalysisFailure,
  DeterministicResult,
  Entitlements,
  ReportStatus,
} from '@gyde/contracts';
import { boolean, jsonb, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Table of the `reports` schema. It is declared WITHOUT a schema qualifier on purpose: the service
 * role has `search_path = reports` (ADR 0009), so the same code works against the shared
 * PostgreSQL and against an in-memory database in tests, where the schema does not exist.
 *
 * Columns mirror `AnalysisSnapshot`, the state of the `Analysis` entity (the repository never
 * stores `project`: the report does not need it) plus `updated_at`, the clock the startup sweep
 * reads. There are no `stage`, `degraded` or `degradedReason` columns: `buildReport()` derives
 * them from `failure` + `aiExpected`.
 */
export const analyses = pgTable('analyses', {
  id: varchar('id', { length: 64 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 64 }).notNull(),
  status: varchar('status', { length: 32 }).$type<ReportStatus>().notNull(),
  aiExpected: boolean('ai_expected').notNull(),
  entitlements: jsonb('entitlements').$type<Entitlements>().notNull(),
  deterministic: jsonb('deterministic').$type<DeterministicResult>(),
  ai: jsonb('ai').$type<AiResult>(),
  failure: jsonb('failure').$type<AnalysisFailure>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});
