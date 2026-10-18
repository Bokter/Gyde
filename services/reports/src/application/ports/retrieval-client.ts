import type { RetrieveRequestDto } from '../dto/analysis.dto';

/** Port to Retrieval. The adapter calls it behind a Circuit Breaker; Retrieval answers 202. */
export interface RetrievalClient {
  retrieve(request: RetrieveRequestDto): Promise<void>;
}

/** DI token of the `RetrievalClient` port: `app.module.ts` binds it to an adapter (see ADR 0011). */
export const RETRIEVAL_CLIENT = Symbol('RetrievalClient');
