import type {
  IngestResult,
  KnowledgeObject as KnowledgeObjectContract,
  KnowledgeQuery,
  KnowledgeQueryResult,
  SourcesStatus,
} from '@gyde/contracts';

import type {
  IngestResultDto,
  KnowledgeQueryDto,
  KnowledgeQueryResultDto,
  SourcesStatusDto,
} from '../../application/dto/knowledge.dto';
import type { AffectedRange, KnowledgeObject } from '../../domain/entities/knowledge-object.entity';

export function toKnowledgeQueryDto(contract: KnowledgeQuery): KnowledgeQueryDto {
  return {
    packages: contract.packages.map(({ ecosystem, name, version }) => ({
      ecosystem,
      name,
      version,
    })),
    ...(contract.kinds && { kinds: contract.kinds }),
    ...(contract.gameEngine && { gameEngine: contract.gameEngine }),
    limit: contract.limit,
  };
}

function toAffectedRangeContract(
  range: AffectedRange,
): KnowledgeObjectContract['affected'][number] {
  return {
    ecosystem: range.ecosystem,
    name: range.name,
    ...(range.introduced !== undefined && { introduced: range.introduced }),
    ...(range.fixed !== undefined && { fixed: range.fixed }),
    ...(range.lastAffected !== undefined && { lastAffected: range.lastAffected }),
    ...(range.versions !== undefined && { versions: [...range.versions] }),
  };
}

/** Field by field, in the order of the contract; optional values that are absent stay absent. */
export function toKnowledgeObjectContract(object: KnowledgeObject): KnowledgeObjectContract {
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
    affected: object.affected.map(toAffectedRangeContract),
    gameEngines: [...object.gameEngines],
    ...(object.url !== undefined && { url: object.url }),
    ...(object.publishedAt !== undefined && { publishedAt: object.publishedAt }),
    ...(object.modifiedAt !== undefined && { modifiedAt: object.modifiedAt }),
    ingestedAt: object.ingestedAt,
  };
}

export function toKnowledgeQueryResultContract(dto: KnowledgeQueryResultDto): KnowledgeQueryResult {
  return { objects: dto.objects.map(toKnowledgeObjectContract) };
}

export function toSourcesStatusContract(dto: SourcesStatusDto): SourcesStatus {
  return {
    sources: dto.sources.map((source) => ({
      name: source.name,
      kind: source.kind,
      trust: source.trust,
      status: source.status,
      ...(source.lastIngestedAt !== undefined && { lastIngestedAt: source.lastIngestedAt }),
      ...(source.lastAttemptAt !== undefined && { lastAttemptAt: source.lastAttemptAt }),
      ...(source.lastError !== undefined && { lastError: source.lastError }),
    })),
  };
}

export function toIngestResultContract(dto: IngestResultDto): IngestResult {
  return {
    source: dto.source,
    recordsProcessed: dto.recordsProcessed,
    recordsSkipped: dto.recordsSkipped,
    startedAt: dto.startedAt,
    finishedAt: dto.finishedAt,
  };
}
