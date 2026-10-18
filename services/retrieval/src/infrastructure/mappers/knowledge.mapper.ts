import type { KnowledgeObject, KnowledgeQuery } from '@gyde/contracts';

import type { KnowledgeQueryDto } from '../../application/dto/retrieval.dto';
import type { KnowledgeEntry } from '../../domain/types';

/**
 * DTO -> wire contract. The key order is part of the cache key of the knowledge source (it hashes
 * the serialized query), so it stays `packages`, `gameEngine`, `limit`.
 */
export function toKnowledgeQueryContract(dto: KnowledgeQueryDto): KnowledgeQuery {
  return {
    packages: dto.packages.map(({ ecosystem, name, version }) => ({ ecosystem, name, version })),
    gameEngine: dto.gameEngine,
    limit: dto.limit,
  };
}

/** Wire contract -> the part of the knowledge the analyzers read. */
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
      ecosystem: range.ecosystem,
      name: range.name,
      ...(range.introduced !== undefined && { introduced: range.introduced }),
      ...(range.fixed !== undefined && { fixed: range.fixed }),
      ...(range.lastAffected !== undefined && { lastAffected: range.lastAffected }),
      ...(range.versions !== undefined && { versions: [...range.versions] }),
    })),
    ...(object.url !== undefined && { url: object.url }),
  };
}
