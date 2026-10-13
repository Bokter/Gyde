import type {
  AnalysisAccepted,
  AnalysisRequest,
  AuthVerifyResponse,
  Report,
} from '@gyde/contracts';
import type { CircuitBreaker, FallbackCache } from '@gyde/resilience';

import type { AnalysisGateway } from '../types';

export interface GydeApiClientOptions {
  /** GYDE_API_URL, e.g. http://localhost:4000 */
  apiUrl: string;
  /** GYDE_API_KEY, sent as `Authorization: Bearer <key>`. Never log it. */
  apiKey: string;
  /** Injectable for tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Circuit Breaker around every call to the gateway. */
  breaker?: CircuitBreaker;
  /** Local cache of the last valid report, served (flagged degraded) while the circuit is open. */
  reportCache?: FallbackCache<Report>;
}

/**
 * HTTP adapter of the gateway. Every call goes through the Circuit Breaker; when it is open the
 * last cached report is returned as a degraded result instead of failing the customer's CI.
 *
 * TODO(area-4): implement with @gyde/contracts ROUTES/buildPath and schema validation of the
 * responses.
 */
export class GydeApiClient implements AnalysisGateway {
  readonly options: GydeApiClientOptions;

  constructor(options: GydeApiClientOptions) {
    this.options = options;
  }

  async verifyKey(): Promise<AuthVerifyResponse> {
    throw new Error('TODO(area-4): GydeApiClient.verifyKey is not implemented yet');
  }

  async submitAnalysis(_request: AnalysisRequest): Promise<AnalysisAccepted> {
    throw new Error('TODO(area-4): GydeApiClient.submitAnalysis is not implemented yet');
  }

  async getReport(_analysisId: string): Promise<Report> {
    throw new Error('TODO(area-4): GydeApiClient.getReport is not implemented yet');
  }
}
