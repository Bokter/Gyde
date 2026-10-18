import type {
  KnowledgeObject,
  SourceKind,
  Trust,
} from '../../domain/entities/knowledge-object.entity';
import type { KnowledgeCriteria } from '../../domain/repositories/knowledge.repository';

export type KnowledgeQueryDto = KnowledgeCriteria;

export type KnowledgeQueryResultDto = {
  readonly objects: readonly KnowledgeObject[];
};

export type SourceStatusDto = {
  readonly name: string;
  readonly kind: SourceKind;
  readonly trust: Trust;
  readonly status: 'never' | 'ok' | 'failed';
  readonly lastIngestedAt?: string;
  readonly lastAttemptAt?: string;
  readonly lastError?: string;
};

export type SourcesStatusDto = {
  readonly sources: readonly SourceStatusDto[];
};

export type IngestResultDto = {
  readonly source: string;
  readonly recordsProcessed: number;
  readonly recordsSkipped: number;
  readonly startedAt: string;
  readonly finishedAt: string;
};
