import type { KnowledgeObject, KnowledgeQuery } from '@gyde/contracts';

/** Port to the normalized knowledge. The adapter calls the normalization service behind a breaker. */
export interface KnowledgeSource {
  query(query: KnowledgeQuery): Promise<KnowledgeObject[]>;
}
