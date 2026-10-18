import { Analysis } from '../../domain/entities/analysis.entity';
import type { AnalysisWatchdog } from '../analysis-watchdog';
import type { AnalysisAcceptedDto, CreateAnalysisDto } from '../dto/analysis.dto';
import type { ReportRepository } from '../ports/report-repository';
import type { RetrievalClient } from '../ports/retrieval-client';

export const CREATE_ANALYSIS = Symbol('CreateAnalysisUseCase');

export interface CreateAnalysisOptions {
  newId: () => string;
  now?: () => Date;
}

/**
 * Creates the job, asks Retrieval for the evidence and answers right away (the caller gets a 202).
 * The job is saved before Retrieval is called. If the call throws, the job is closed as `failed`
 * (`retrieval-error`) and the answer is still the accepted one; otherwise the retrieval watchdog
 * is armed so a Retrieval that never answers does not leave the job stuck.
 */
export class CreateAnalysisUseCase {
  constructor(
    private readonly repository: ReportRepository,
    private readonly retrieval: RetrievalClient,
    private readonly watchdog: AnalysisWatchdog,
    private readonly options: CreateAnalysisOptions,
  ) {}

  private now(): Date {
    return this.options.now ? this.options.now() : new Date();
  }

  async execute(job: CreateAnalysisDto): Promise<AnalysisAcceptedDto> {
    const id = this.options.newId();
    const analysis = Analysis.create(
      {
        id,
        tenantId: job.tenantId,
        entitlements: job.entitlements,
        includeAi: job.request.options.includeAi,
      },
      this.now(),
    );
    await this.repository.create(analysis);

    try {
      await this.retrieval.retrieve({
        analysisId: id,
        tenantId: job.tenantId,
        entitlements: job.entitlements,
        request: job.request,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Retrieval is unavailable';
      analysis.recordFailure(
        { analysisId: id, stage: 'retrieval', reason: 'retrieval-error', message },
        this.now(),
      );
      await this.repository.update(analysis);
      // The answer stays "retrieving" even though the job is already failed: the client learns
      // it from the report.
      return { analysisId: id, status: 'retrieving' };
    }

    this.watchdog.armRetrievalTimeout(id);
    return { analysisId: id, status: 'retrieving' };
  }
}
