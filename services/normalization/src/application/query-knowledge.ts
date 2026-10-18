import type { KnowledgeQueryDto, KnowledgeQueryResultDto } from './dto/knowledge.dto';
import type { KnowledgeRepository } from './ports/knowledge-repository';

/**
 * Candidates for the requested packages (`POST /internal/knowledge/query`). Deliberately not
 * filtered by version: the dependency/version crossing belongs to Retrieval.
 */
export class QueryKnowledge {
  constructor(private readonly repository: KnowledgeRepository) {}

  async execute(query: KnowledgeQueryDto): Promise<KnowledgeQueryResultDto> {
    return { objects: await this.repository.query(query) };
  }
}
