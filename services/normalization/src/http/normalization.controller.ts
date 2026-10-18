import {
  type IngestResult,
  KnowledgeQuery,
  type KnowledgeQueryResult,
  ROUTES,
  type SourcesStatus,
} from '@gyde/contracts';
import { ZodValidationPipe } from '@gyde/service-kit';
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';

import { IngestSource } from '../application/ingest-source';
import { ListSources } from '../application/list-sources';
import { QueryKnowledge } from '../application/query-knowledge';
import {
  toIngestResultContract,
  toKnowledgeQueryDto,
  toKnowledgeQueryResultContract,
  toSourcesStatusContract,
} from './mappers/normalization.mapper';

/**
 * HTTP surface of the normalization service: internal only (every route is under /internal and
 * needs `x-internal-token`). Controllers validate and delegate; the rules live in `application/`.
 */
@Controller()
export class NormalizationController {
  constructor(
    @Inject(QueryKnowledge) private readonly queryKnowledge: QueryKnowledge,
    @Inject(ListSources) private readonly listSources: ListSources,
    @Inject(IngestSource) private readonly ingestSource: IngestSource,
  ) {}

  @Post(ROUTES.normalization.query)
  @HttpCode(200)
  async query(
    @Body(new ZodValidationPipe(KnowledgeQuery)) body: KnowledgeQuery,
  ): Promise<KnowledgeQueryResult> {
    return toKnowledgeQueryResultContract(
      await this.queryKnowledge.execute(toKnowledgeQueryDto(body)),
    );
  }

  @Get(ROUTES.normalization.sources)
  async sources(): Promise<SourcesStatus> {
    return toSourcesStatusContract(await this.listSources.execute());
  }

  /** Manual ingestion: answers when the run finished (a failed run is recorded and answers 503). */
  @Post(ROUTES.normalization.ingest)
  @HttpCode(200)
  async ingest(@Param('source') source: string): Promise<IngestResult> {
    return toIngestResultContract(await this.ingestSource.execute(source));
  }
}
