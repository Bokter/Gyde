import { Analysis } from '../../domain/entities/analysis.entity';
import type { analyses } from '../db/schema';

export type AnalysisRow = typeof analyses.$inferSelect;

/**
 * Row -> entity. The JSON columns (entitlements, results, failure) are handed over as stored: a
 * row written by an older version is read as is, never validated.
 */
export function toEntity(row: AnalysisRow): Analysis {
  return Analysis.rehydrate({
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
  });
}

/** Entity -> a row ready to insert; `updatedAt` is the clock the startup sweep reads, so it is explicit. */
export function toRow(analysis: Analysis, updatedAt: Date) {
  const state = analysis.snapshot();
  return {
    id: state.id,
    tenantId: state.tenantId,
    status: state.status,
    aiExpected: state.aiExpected,
    entitlements: state.entitlements,
    deterministic: state.deterministic ?? null,
    ai: state.ai ?? null,
    failure: state.failure ?? null,
    createdAt: new Date(state.createdAt),
    updatedAt,
    completedAt: state.completedAt ? new Date(state.completedAt) : null,
  };
}
