import { ROUTES, type RetrieveRequest } from '@gyde/contracts';
import type { ResilientHttpClient } from '@gyde/service-kit';

import type { RetrievalClient } from '../application/ports/retrieval-client';

/**
 * HTTP adapter of the `RetrievalClient` port. The call goes through `ResilientHttpClient`: the
 * instance is found by service discovery (the static `RETRIEVAL_URL` is only the fallback), and a
 * Circuit Breaker guards it. When Retrieval cannot be reached or the circuit is open the error
 * propagates, so `AnalysisLifecycle.create` marks the job as failed instead of leaving it stuck.
 */
export class HttpRetrievalClient implements RetrievalClient {
  constructor(private readonly http: ResilientHttpClient) {}

  async retrieve(request: RetrieveRequest): Promise<void> {
    await this.http.postJson('retrieval', ROUTES.retrieval.retrieve, request);
  }
}
