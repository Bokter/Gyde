import type { SweepResultDto } from './dto/analysis.dto';
import type { ReportRepository } from './ports/report-repository';

export const SWEEP_STALE_ANALYSES = Symbol('SweepStaleAnalyses');

export interface SweepStaleAnalysesOptions {
  aiTimeoutMs: number;
  retrievalTimeoutMs: number;
  now?: () => Date;
}

/**
 * Startup sweep: closes analyses that a previous run left in progress (its watchdogs died with the
 * process), with the same thresholds as the timers:
 * - `analyzing` older than the AI timeout -> `ready` + degraded (`llm-unavailable`).
 * - `retrieving` older than the retrieval timeout -> `failed` (`retrieval-error`).
 * Returns how many of each it closed so the caller can log them. With the in-memory repository the
 * store starts empty, so it reports zeroes and changes nothing.
 */
export class SweepStaleAnalyses {
  constructor(
    private readonly repository: ReportRepository,
    private readonly options: SweepStaleAnalysesOptions,
  ) {}

  private now(): Date {
    return this.options.now ? this.options.now() : new Date();
  }

  async execute(): Promise<SweepResultDto> {
    const staleAnalyzing = await this.repository.findStale(
      'analyzing',
      new Date(this.now().getTime() - this.options.aiTimeoutMs),
    );
    for (const analysis of staleAnalyzing) {
      if (analysis.timeOutAi(this.now(), 'restart')) {
        await this.repository.update(analysis);
      }
    }

    const staleRetrieving = await this.repository.findStale(
      'retrieving',
      new Date(this.now().getTime() - this.options.retrievalTimeoutMs),
    );
    for (const analysis of staleRetrieving) {
      if (analysis.timeOutRetrieval(this.now(), 'restart')) {
        await this.repository.update(analysis);
      }
    }

    return { analyzing: staleAnalyzing.length, retrieving: staleRetrieving.length };
  }
}
