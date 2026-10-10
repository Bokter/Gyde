import { KnowledgeObject, type KnowledgeQuery } from '@gyde/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';

import type { IngestionRun, KnowledgeRepository } from '../application/ports/knowledge-repository';
import { DATABASE, type Database, type DatabaseHandle } from './db/database';
import { ingestionRuns, knowledgeObjects, knowledgePackages } from './db/schema';

type ObjectRow = typeof knowledgeObjects.$inferSelect;
interface PackageKey {
  ecosystem: string;
  nameKey: string;
}

/** Rows per INSERT: keeps every statement far below PostgreSQL's 65 535 bind parameters. */
const BATCH_SIZE = 200;

/** NuGet and vcpkg names are case-insensitive; the exact match is Retrieval's job. */
const nameKey = (name: string): string => name.toLowerCase();
const toDate = (iso: string | undefined): Date | null => (iso ? new Date(iso) : null);
/** `2026-01-15T00:00:00.000Z` → `2026-01-15T00:00:00Z`, so whole-second dates round-trip as given. */
const toIso = (date: Date): string => date.toISOString().replace('.000Z', 'Z');

function toRow(object: KnowledgeObject): typeof knowledgeObjects.$inferInsert {
  return {
    id: object.id,
    kind: object.kind,
    source: object.source,
    sourceKind: object.sourceKind,
    trust: object.trust,
    title: object.title,
    summary: object.summary,
    aliases: object.aliases,
    severity: object.severity ?? null,
    cvss: object.cvss ?? null,
    affected: object.affected,
    gameEngines: object.gameEngines,
    url: object.url ?? null,
    publishedAt: toDate(object.publishedAt),
    modifiedAt: toDate(object.modifiedAt),
    ingestedAt: new Date(object.ingestedAt),
  };
}

/** Rebuilds the object and validates it, so a corrupt row can never leak past the contract. */
function toObject(row: ObjectRow): KnowledgeObject {
  return KnowledgeObject.parse({
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

/** Distinct (ecosystem, lower-cased name) pairs, in first-seen order. */
function distinctKeys(items: readonly { ecosystem: string; name: string }[]): PackageKey[] {
  const unique = new Map<string, PackageKey>();
  for (const item of items) {
    const key = { ecosystem: item.ecosystem, nameKey: nameKey(item.name) };
    unique.set(`${key.ecosystem}\u0000${key.nameKey}`, key);
  }
  return [...unique.values()];
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

/** `KnowledgeRepository` over the `normalization` schema of PostgreSQL (ADR 0009). */
@Injectable()
export class PostgresKnowledgeRepository implements KnowledgeRepository {
  private readonly db: Database;

  constructor(@Inject(DATABASE) database: DatabaseHandle) {
    this.db = database.db;
  }

  async upsertMany(objects: readonly KnowledgeObject[]): Promise<void> {
    // The same id twice in one batch would make ON CONFLICT touch a row twice: the last one wins.
    const byId = new Map<string, KnowledgeObject>();
    for (const object of objects) byId.set(object.id, KnowledgeObject.parse(object));
    if (byId.size === 0) return;

    await this.db.transaction(async (tx) => {
      for (const batch of chunks([...byId.values()], BATCH_SIZE)) {
        await tx
          .insert(knowledgeObjects)
          .values(batch.map(toRow))
          .onConflictDoUpdate({
            target: knowledgeObjects.id,
            set: {
              kind: sql`excluded.kind`,
              source: sql`excluded.source`,
              sourceKind: sql`excluded.source_kind`,
              trust: sql`excluded.trust`,
              title: sql`excluded.title`,
              summary: sql`excluded.summary`,
              aliases: sql`excluded.aliases`,
              severity: sql`excluded.severity`,
              cvss: sql`excluded.cvss`,
              affected: sql`excluded.affected`,
              gameEngines: sql`excluded.game_engines`,
              url: sql`excluded.url`,
              publishedAt: sql`excluded.published_at`,
              modifiedAt: sql`excluded.modified_at`,
              ingestedAt: sql`excluded.ingested_at`,
            },
          });

        // The package index is rebuilt: a record that stops mentioning a package must stop matching it.
        await tx.delete(knowledgePackages).where(
          inArray(
            knowledgePackages.objectId,
            batch.map((object) => object.id),
          ),
        );
        const packages = batch.flatMap((object) =>
          distinctKeys(object.affected.map((range) => ({ ...range }))).map((key) => ({
            objectId: object.id,
            ...key,
          })),
        );
        for (const packageBatch of chunks(packages, BATCH_SIZE * 4)) {
          await tx.insert(knowledgePackages).values(packageBatch);
        }
      }
    });
  }

  async query(query: KnowledgeQuery): Promise<KnowledgeObject[]> {
    const keys = distinctKeys(query.packages);

    // One JSON parameter, however many packages: a bind parameter per package would hit limits.
    const requested = JSON.stringify(
      keys.map((key) => ({ ecosystem: key.ecosystem, name_key: key.nameKey })),
    );
    const mentioned = sql`${knowledgeObjects.id} in (
      select p.object_id
      from ${knowledgePackages} p
      join jsonb_to_recordset(${requested}::jsonb) as q(ecosystem text, name_key text)
        on q.ecosystem = p.ecosystem and q.name_key = p.name_key
    )`;

    const rows = await this.db
      .select()
      .from(knowledgeObjects)
      .where(
        and(
          mentioned,
          query.kinds && inArray(knowledgeObjects.kind, query.kinds),
          // An item with no engine applies to every engine; otherwise it must list the requested one.
          query.gameEngine &&
            or(
              sql`cardinality(${knowledgeObjects.gameEngines}) = 0`,
              sql`${query.gameEngine} = any(${knowledgeObjects.gameEngines})`,
            ),
        ),
      )
      .orderBy(asc(knowledgeObjects.id))
      .limit(query.limit);

    return rows.map(toObject);
  }

  async recordRun(run: IngestionRun): Promise<void> {
    await this.db.insert(ingestionRuns).values({
      source: run.source,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      recordsProcessed: run.recordsProcessed,
      error: run.error ?? null,
    });
  }

  async lastIngestedAt(source: string): Promise<Date | undefined> {
    const [row] = await this.db
      .select({ finishedAt: ingestionRuns.finishedAt })
      .from(ingestionRuns)
      .where(and(eq(ingestionRuns.source, source), eq(ingestionRuns.status, 'success')))
      .orderBy(desc(ingestionRuns.finishedAt))
      .limit(1);
    return row?.finishedAt;
  }
}
