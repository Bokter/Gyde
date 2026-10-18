import type { KnowledgeAnswerDto, KnowledgeQueryDto } from '../dto/retrieval.dto';

/** Port to the normalized knowledge. The adapter calls the normalization service behind a breaker. */
export interface KnowledgeSource {
  /** @throws KnowledgeUnavailableError when there is no answer at all (not even a cached one). */
  query(query: KnowledgeQueryDto): Promise<KnowledgeAnswerDto>;
}

/** DI token of the `KnowledgeSource` port: `app.module.ts` binds it to an adapter (see ADR 0011). */
export const KNOWLEDGE_SOURCE = Symbol('KnowledgeSource');
