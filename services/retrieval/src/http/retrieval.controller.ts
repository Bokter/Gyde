import { ROUTES, RetrieveRequest } from '@gyde/contracts';
import { ZodValidationPipe } from '@gyde/service-kit';
import { Body, Controller, HttpCode, Inject, Logger, Post } from '@nestjs/common';

import { BackgroundJobs } from '../application/background-jobs';
import { RetrieveEvidence } from '../application/retrieve-evidence';

import { toRetrieveEvidenceDto } from './mappers/retrieval.mapper';

/**
 * HTTP surface of Retrieval: internal only. Reports is its only caller.
 *
 * It answers 202 at once and runs `RetrieveEvidence` in the background: the results travel to
 * Reports (and llm-analysis) through their own endpoints, never in this response.
 */
@Controller()
export class RetrievalController {
  private readonly logger = new Logger(RetrievalController.name);

  constructor(
    @Inject(RetrieveEvidence) private readonly retrieveEvidence: RetrieveEvidence,
    @Inject(BackgroundJobs) private readonly jobs: BackgroundJobs,
  ) {}

  @Post(ROUTES.retrieval.retrieve)
  @HttpCode(202)
  retrieve(@Body(new ZodValidationPipe(RetrieveRequest)) body: RetrieveRequest): void {
    const job = toRetrieveEvidenceDto(body);
    this.jobs.run(
      () => this.retrieveEvidence.execute(job),
      // `execute` handles its own failures; this only catches a bug in it.
      (error) =>
        this.logger.error(
          `Unexpected error retrieving ${body.analysisId}: ${error instanceof Error ? error.message : 'unknown'}`,
        ),
    );
  }
}
