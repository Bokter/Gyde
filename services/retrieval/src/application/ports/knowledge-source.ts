import type { KnowledgeObject, KnowledgeQuery } from '@gyde/contracts';

/** Port to the normalized knowledge. The adapter calls the normalization service behind a breaker. */
export interface KnowledgeSource {
  query(query: KnowledgeQuery): Promise<KnowledgeObject[]>;
}

/** DI token of the `KnowledgeSource` port: `app.module.ts` binds it to an adapter (see ADR 0011). */
export const KNOWLEDGE_SOURCE = Symbol('KnowledgeSource');
