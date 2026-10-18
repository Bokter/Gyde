import type {
  Ecosystem,
  GameEngine,
  KnowledgeKind,
  KnowledgeObject,
  SourceKind,
  Trust,
} from '../../domain/knowledge-object';

export type KnowledgeQueryDto = {
  readonly packages: readonly {
    readonly ecosystem: Ecosystem;
    readonly name: string;
    readonly version: string;
  }[];
  readonly kinds?: readonly KnowledgeKind[];
  readonly gameEngine?: GameEngine;
  readonly limit: number;
};

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
