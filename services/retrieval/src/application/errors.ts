/**
 * Normalization could not answer (down, circuit open, no instance) and nothing was cached.
 * The use case keeps going without knowledge and flags the result `partialSources`.
 */
export class KnowledgeUnavailableError extends Error {
  constructor(reason: string) {
    super(`Knowledge is unavailable: ${reason}`);
    this.name = 'KnowledgeUnavailableError';
  }
}

/**
 * llm-analysis could not be reached (down, circuit open, no healthy instance). The report stays
 * deterministic and Retrieval is the one that tells Reports (`llm-unavailable`).
 */
export class LlmUnavailableError extends Error {
  constructor(reason: string) {
    super(`llm-analysis is unavailable: ${reason}`);
    this.name = 'LlmUnavailableError';
  }
}
