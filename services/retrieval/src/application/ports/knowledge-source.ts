import type { KnowledgeObject, KnowledgeQuery } from '@gyde/contracts';

export interface KnowledgeAnswer {
  objects: KnowledgeObject[];
  /**
   * True when the answer is not fresh and complete: it was served from the last cached response
   * because normalization could not be reached.
   */
  partial: boolean;
}

/** Port to the normalized knowledge. The adapter calls the normalization service behind a breaker. */
export interface KnowledgeSource {
  /** @throws KnowledgeUnavailableError when there is no answer at all (not even a cached one). */
  query(query: KnowledgeQuery): Promise<KnowledgeAnswer>;
}

/** DI token of the `KnowledgeSource` port: `app.module.ts` binds it to an adapter (see ADR 0011). */
export const KNOWLEDGE_SOURCE = Symbol('KnowledgeSource');
