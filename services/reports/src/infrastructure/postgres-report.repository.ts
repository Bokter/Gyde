import type { ReportStatus } from '@gyde/contracts';
import { and, eq, lte } from 'drizzle-orm';

import type { ReportRepository, StoredAnalysis } from '../application/ports/report-repository';
import type { Database } from './db/database';
import { analyses } from './db/schema';

type AnalysisRow = typeof analyses.$inferSelect;

function toStored(row: AnalysisRow): StoredAnalysis {
  return {
    id: row.id,
    tenantId: row.tenantId,
    status: row.status,
    aiExpected: row.aiExpected,
    entitlements: row.entitlements,
    createdAt: row.createdAt.toISOString(),
    ...(row.completedAt ? { completedAt: row.completedAt.toISOString() } : {}),
    ...(row.deterministic ? { deterministic: row.deterministic } : {}),
    ...(row.ai ? { ai: row.ai } : {}),
    ...(row.failure ? { failure: row.failure } : {}),
  };
}

/** A row ready to insert; `updatedAt` is the clock the startup sweep reads, so it is explicit. */
function toRow(analysis: StoredAnalysis, updatedAt: Date) {
  return {
    id: analysis.id,
    tenantId: analysis.tenantId,
    status: analysis.status,
    aiExpected: analysis.aiExpected,
    entitlements: analysis.entitlements,
    deterministic: analysis.deterministic ?? null,
    ai: analysis.ai ?? null,
    failure: analysis.failure ?? null,
    createdAt: new Date(analysis.createdAt),
    updatedAt,
    completedAt: analysis.completedAt ? new Date(analysis.completedAt) : null,
  };
}

/**
 * PostgreSQL adapter of the `ReportRepository` port (schema `reports`).
 * Every write goes through an upsert because `create` and `update` land on the same row and the
 * watchdogs may finish a job that another delivery is writing at the same time.
 */
export class PostgresReportRepository implements ReportRepository {
  constructor(private readonly db: Database) {}

  async create(analysis: StoredAnalysis): Promise<void> {
    await this.db.insert(analyses).values(toRow(analysis, new Date(analysis.createdAt)));
  }

  async get(id: string): Promise<StoredAnalysis | undefined> {
    const rows = await this.db.select().from(analyses).where(eq(analyses.id, id)).limit(1);
    return rows[0] ? toStored(rows[0]) : undefined;
  }

  async update(analysis: StoredAnalysis): Promise<void> {
    const { id, ...values } = toRow(analysis, new Date());
    await this.db
      .insert(analyses)
      .values({ id, ...values })
      .onConflictDoUpdate({ target: analyses.id, set: values });
  }

  async findStale(status: ReportStatus, cutoff: Date): Promise<StoredAnalysis[]> {
    const rows = await this.db
      .select()
      .from(analyses)
      .where(and(eq(analyses.status, status), lte(analyses.updatedAt, cutoff)));
    return rows.map(toStored);
  }
}
