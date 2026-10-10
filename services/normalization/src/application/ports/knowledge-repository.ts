import type { KnowledgeObject, KnowledgeQuery } from '@gyde/contracts';

/** Port to the "base de datos utilizable" of the Pipeline de Normalización. */
export interface KnowledgeRepository {
  /** Idempotent: objects are keyed by `id`, re-ingesting the same record updates it. */
  upsertMany(objects: readonly KnowledgeObject[]): Promise<void>;

  /**
   * Objects that mention any of the requested packages (same ecosystem and name). Deliberately NOT
   * filtered by version: the deterministic dependency/version matching belongs to Retrieval.
   */
  query(query: KnowledgeQuery): Promise<KnowledgeObject[]>;

  /** When a source was last ingested successfully (drives incremental fetches and /sources). */
  lastIngestedAt(source: string): Promise<Date | undefined>;
}

/** DI token of the `KnowledgeRepository` port: `app.module.ts` binds it to an adapter (see ADR 0011). */
export const KNOWLEDGE_REPOSITORY = Symbol('KnowledgeRepository');
