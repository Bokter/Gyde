import { ROUTES, type RetrieveRequest } from '@gyde/contracts';
import { CircuitBreaker, createBreakerFromEnv } from '@gyde/resilience';

import type { RetrievalClient } from '../application/ports/retrieval-client';

export interface HttpRetrievalClientOptions {
  /** Static URL of Retrieval, e.g. http://localhost:4300 (service discovery plugs in later). */
  retrievalUrl: string;
  /** Shared secret sent as `x-internal-token`. */
  internalToken: string;
  fetch?: typeof fetch;
  breaker?: CircuitBreaker;
}

/**
 * HTTP adapter of the `RetrievalClient` port. Every call goes through a Circuit Breaker; when
 * the circuit is open the error propagates so `AnalysisLifecycle.create` can mark the job as
 * failed instead of leaving it stuck.
 */
export class HttpRetrievalClient implements RetrievalClient {
  private readonly retrievalUrl: string;
  private readonly internalToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly breaker: CircuitBreaker;

  constructor(options: HttpRetrievalClientOptions) {
    this.retrievalUrl = options.retrievalUrl.replace(/\/$/, '');
    this.internalToken = options.internalToken;
    this.fetchImpl = options.fetch ?? fetch;
    this.breaker =
      options.breaker ?? new CircuitBreaker(createBreakerFromEnv('reports->retrieval'));
  }

  async retrieve(request: RetrieveRequest): Promise<void> {
    await this.breaker.execute(async () => {
      const response = await this.fetchImpl(`${this.retrievalUrl}${ROUTES.retrieval.retrieve}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-token': this.internalToken,
        },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        throw new Error(`Retrieval answered ${response.status} for ${ROUTES.retrieval.retrieve}`);
      }
    });
  }
}
