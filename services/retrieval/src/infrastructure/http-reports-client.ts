import { type AnalysisFailure, type DeterministicResult, ROUTES, buildPath } from '@gyde/contracts';

import type { ReportsClient } from '../application/ports/downstream';
import type { InternalHttpClient } from './internal-http-client';

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
    private readonly client: InternalHttpClient,
    options: HttpReportsClientOptions = {},
  ) {
    this.attempts = options.attempts ?? 3;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  publishDeterministicResult(result: DeterministicResult): Promise<void> {
    const path = buildPath(ROUTES.reports.deterministicResult, { analysisId: result.analysisId });
    return this.post(path, result);
  }

  publishFailure(failure: AnalysisFailure): Promise<void> {
    const path = buildPath(ROUTES.reports.failure, { analysisId: failure.analysisId });
    return this.post(path, failure);
  }

  private async post(path: string, body: unknown): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.client.postJson('reports', path, body);
        return;
      } catch (error) {
        // Only an outage is worth retrying; a rejection (4xx) would fail the same way again.
        const outage = error instanceof Error && error.name === 'ServiceUnavailableError';
        if (!outage || attempt >= this.attempts) throw error;
        await this.sleep(BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)]!);
      }
    }
  }
}
