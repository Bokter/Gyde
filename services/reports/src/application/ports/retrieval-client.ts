import type { RetrieveRequest } from '@gyde/contracts';

/** Port to Retrieval. The adapter calls it behind a Circuit Breaker; Retrieval answers 202. */
export interface RetrievalClient {
  retrieve(request: RetrieveRequest): Promise<void>;
}
