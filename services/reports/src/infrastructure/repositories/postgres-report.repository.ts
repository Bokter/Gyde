import { and, eq, lte } from 'drizzle-orm';

import type { ReportRepository } from '../../domain/repositories/report.repository';
import type { Analysis } from '../../domain/entities/analysis.entity';
import type { AnalysisStatus } from '../../domain/entities/analysis-types';
import type { Database } from '../db/database';
import { analyses } from '../db/schema';
import { toEntity, toRow } from '../mappers/analysis.mapper';

/**
 * PostgreSQL adapter of the `ReportRepository` port (schema `reports`).
 * Every write goes through an upsert because `create` and `update` land on the same row and the
 * watchdogs may finish a job that another delivery is writing at the same time.
 */
export class PostgresReportRepository implements ReportRepository {
  constructor(private readonly db: Database) {}

  async create(analysis: Analysis): Promise<void> {
    await this.db.insert(analyses).values(toRow(analysis, new Date(analysis.snapshot().createdAt)));
  }

  async get(id: string): Promise<Analysis | undefined> {
    const rows = await this.db.select().from(analyses).where(eq(analyses.id, id)).limit(1);
    return rows[0] ? toEntity(rows[0]) : undefined;
  }

  async update(analysis: Analysis): Promise<void> {
    const { id, ...values } = toRow(analysis, new Date());
    await this.db
      .insert(analyses)
      .values({ id, ...values })
      .onConflictDoUpdate({ target: analyses.id, set: values });
  }

  async findStale(status: AnalysisStatus, cutoff: Date): Promise<Analysis[]> {
    const rows = await this.db
      .select()
      .from(analyses)
      .where(and(eq(analyses.status, status), lte(analyses.updatedAt, cutoff)));
    return rows.map(toEntity);
  }
}
