import type {
  Ecosystem,
  GameEngine,
  KnowledgeKind,
  KnowledgeObject,
} from '../entities/knowledge-object.entity';

/** Criteria of a knowledge lookup: the packages to match and how many objects to return. */
export type KnowledgeCriteria = {
  readonly packages: readonly {
    readonly ecosystem: Ecosystem;
    readonly name: string;
    readonly version: string;
  }[];
  readonly kinds?: readonly KnowledgeKind[];
  readonly gameEngine?: GameEngine;
  readonly limit: number;
};

/** Outcome of one ingestion attempt of a source. */
export interface IngestionRun {
  source: string;
  status: 'success' | 'failed';
  startedAt: Date;
  finishedAt: Date;
  recordsProcessed: number;
  /** Short, secret-free reason when `status` is `failed`. */
  error?: string;
}

/** Contract of the "base de datos utilizable" of the Pipeline de Normalización. */
export interface KnowledgeRepository {
  /** Idempotent: objects are keyed by `id`, re-ingesting the same record updates it. */
  upsertMany(objects: readonly KnowledgeObject[]): Promise<void>;

  /**
   * Objects that mention any of the requested packages (same ecosystem and name). Deliberately NOT
   * filtered by version: the deterministic dependency/version matching belongs to Retrieval.
   */
  query(criteria: KnowledgeCriteria): Promise<KnowledgeObject[]>;

  /** Records the outcome of an ingestion attempt (successful or not). */
  recordRun(run: IngestionRun): Promise<void>;

  /** The most recent ingestion attempt of a source, successful or not (drives `GET /sources`). */
  lastRun(source: string): Promise<IngestionRun | undefined>;

  /** When a source was last ingested successfully (drives incremental fetches and /sources). */
  lastIngestedAt(source: string): Promise<Date | undefined>;
}

/** DI token of the `KnowledgeRepository` contract: `app.module.ts` binds it to an adapter (see ADR 0011). */
export const KNOWLEDGE_REPOSITORY = Symbol('KnowledgeRepository');
