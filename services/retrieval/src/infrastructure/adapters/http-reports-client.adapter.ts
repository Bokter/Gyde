import { ROUTES, buildPath } from '@gyde/contracts';
import type { ResilientHttpClient } from '@gyde/service-kit';

import type {
  AnalysisFailureDto,
  DeterministicResultDto,
} from '../../application/dto/retrieval.dto';
import type { ReportsClient } from '../../application/ports/downstream';
import {
  toAnalysisFailureContract,
  toDeterministicResultContract,
} from '../mappers/pipeline.mapper';
import { ServiceUnavailableError, toUnavailable } from '../unavailable';

export interface HttpReportsClientOptions {
  /** Attempts per message: Reports may be restarting, and a lost result leaves the report waiting. */
  attempts?: number;
  /** Pause before attempt n+1 (ms). Injectable so tests never wait. */
  sleep?: (ms: number) => Promise<void>;
}

const BACKOFF_MS = [200, 600];

/** Delivers the deterministic result (and failures) to Reports, retrying a short outage. */
export class HttpReportsClient implements ReportsClient {
  private readonly attempts: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly http: ResilientHttpClient,
    options: HttpReportsClientOptions = {},
  ) {
    this.attempts = options.attempts ?? 3;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  publishDeterministicResult(result: DeterministicResultDto): Promise<void> {
    const path = buildPath(ROUTES.reports.deterministicResult, { analysisId: result.analysisId });
    return this.post(path, toDeterministicResultContract(result));
  }

  publishFailure(failure: AnalysisFailureDto): Promise<void> {
    const path = buildPath(ROUTES.reports.failure, { analysisId: failure.analysisId });
    return this.post(path, toAnalysisFailureContract(failure));
  }

  private async post(path: string, body: unknown): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.http.postJson('reports', path, body);
        return;
      } catch (error) {
        const failure = toUnavailable('reports', error);
        // Only an outage is worth retrying; a refusal (4xx) would fail the same way again.
        const retry = failure instanceof ServiceUnavailableError && attempt < this.attempts;
        if (!retry) throw failure;
        await this.sleep(BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)]!);
      }
    }
  }
}
