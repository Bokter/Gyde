import { KnowledgeObject as KnowledgeObjectContract } from '@gyde/contracts';

import type { KnowledgeObject } from '../../domain/entities/knowledge-object.entity';
import type { knowledgeObjects } from '../db/schema';

export type ObjectRow = typeof knowledgeObjects.$inferSelect;
export type ObjectInsert = typeof knowledgeObjects.$inferInsert;

const toDate = (iso: string | undefined): Date | null => (iso ? new Date(iso) : null);
/** `2026-01-15T00:00:00.000Z` -> `2026-01-15T00:00:00Z`, so whole-second dates round-trip as given. */
const toIso = (date: Date): string => date.toISOString().replace('.000Z', 'Z');

/**
 * Validates a value against the knowledge contract (applying its defaults) and returns it as an
 * entity, so a bad object can never be stored and a corrupt row can never be served.
 */
export function parseKnowledgeObject(value: unknown): KnowledgeObject {
  return KnowledgeObjectContract.parse(value);
}

export function toRow(object: KnowledgeObject): ObjectInsert {
  return {
    id: object.id,
    kind: object.kind,
    source: object.source,
    sourceKind: object.sourceKind,
    trust: object.trust,
    title: object.title,
    summary: object.summary,
    aliases: [...object.aliases],
    severity: object.severity ?? null,
    cvss: object.cvss ?? null,
    affected: object.affected.map((range) => ({
      ecosystem: range.ecosystem,
      name: range.name,
      ...(range.introduced !== undefined && { introduced: range.introduced }),
      ...(range.fixed !== undefined && { fixed: range.fixed }),
      ...(range.lastAffected !== undefined && { lastAffected: range.lastAffected }),
      ...(range.versions !== undefined && { versions: [...range.versions] }),
    })),
    gameEngines: [...object.gameEngines],
    url: object.url ?? null,
    publishedAt: toDate(object.publishedAt),
    modifiedAt: toDate(object.modifiedAt),
    ingestedAt: new Date(object.ingestedAt),
  };
}

/** Rebuilds the entity from a row and validates it against the contract. */
export function toEntity(row: ObjectRow): KnowledgeObject {
  return parseKnowledgeObject({
    id: row.id,
    kind: row.kind,
    source: row.source,
    sourceKind: row.sourceKind,
    trust: row.trust,
    title: row.title,
    summary: row.summary,
    aliases: row.aliases,
    ...(row.severity !== null && { severity: row.severity }),
    ...(row.cvss !== null && { cvss: row.cvss }),
    affected: row.affected,
    gameEngines: row.gameEngines,
    ...(row.url !== null && { url: row.url }),
    ...(row.publishedAt !== null && { publishedAt: toIso(row.publishedAt) }),
    ...(row.modifiedAt !== null && { modifiedAt: toIso(row.modifiedAt) }),
    ingestedAt: toIso(row.ingestedAt),
  });
}
