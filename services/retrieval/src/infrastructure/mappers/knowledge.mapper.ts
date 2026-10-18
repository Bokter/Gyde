import type { KnowledgeObject, KnowledgeQuery } from '@gyde/contracts';

import type { KnowledgeQueryDto } from '../../application/dto/retrieval.dto';
import type { KnowledgeEntry } from '../../domain/model';

/**
 * Contract -> domain: keeps what the analyzers read. Optional fields are copied only when present,
 * so a missing field stays missing (never `undefined`).
 */
export function toKnowledgeEntry(object: KnowledgeObject): KnowledgeEntry {
  return {
    id: object.id,
    kind: object.kind,
    source: object.source,
    sourceKind: object.sourceKind,
    trust: object.trust,
    title: object.title,
    summary: object.summary,
    aliases: [...object.aliases],
    ...(object.severity !== undefined && { severity: object.severity }),
    ...(object.cvss !== undefined && { cvss: object.cvss }),
    affected: object.affected.map((range) => ({
      ...range,
      ...(range.versions && { versions: [...range.versions] }),
    })),
    ...(object.url !== undefined && { url: object.url }),
  };
}

/** Port query -> body of `POST /internal/knowledge/query`. The key order is part of the cache key. */
export function toKnowledgeQueryContract(query: KnowledgeQueryDto): KnowledgeQuery {
  return {
    packages: query.packages.map(({ ecosystem, name, version }) => ({ ecosystem, name, version })),
    gameEngine: query.gameEngine,
    limit: query.limit,
  };
}
