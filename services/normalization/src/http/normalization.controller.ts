import {
  type IngestResult,
  KnowledgeQuery,
  type KnowledgeQueryResult,
  ROUTES,
  type SourcesStatus,
} from '@gyde/contracts';
import { ZodValidationPipe } from '@gyde/service-kit';
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';

import { IngestSourceUseCase } from '../application/use-cases/ingest-source.use-case';
import { ListSourcesUseCase } from '../application/use-cases/list-sources.use-case';
import { QueryKnowledgeUseCase } from '../application/use-cases/query-knowledge.use-case';
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
    @Inject(QueryKnowledgeUseCase) private readonly queryKnowledge: QueryKnowledgeUseCase,
    @Inject(ListSourcesUseCase) private readonly listSources: ListSourcesUseCase,
    @Inject(IngestSourceUseCase) private readonly ingestSource: IngestSourceUseCase,
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
