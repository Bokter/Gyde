/**
 * Base of the errors of the application layer. They carry a stable `code` and no HTTP status:
 * none of them reaches the HTTP edge (the use case consumes them and tells Reports instead).
 */
export class RetrievalError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RetrievalError';
  }
}

/**
 * Normalization could not answer (down, circuit open, no instance) and nothing was cached.
 * The use case keeps going without knowledge and flags the result `partialSources`.
 */
export class KnowledgeUnavailableError extends RetrievalError {
  constructor(reason: string) {
    super('knowledge_unavailable', `Knowledge is unavailable: ${reason}`);
    this.name = 'KnowledgeUnavailableError';
  }
}

/**
 * llm-analysis could not be reached (down, circuit open, no healthy instance). The report stays
 * deterministic and Retrieval is the one that tells Reports (`llm-unavailable`).
 */
export class LlmUnavailableError extends RetrievalError {
  constructor(reason: string) {
    super('llm_unavailable', `llm-analysis is unavailable: ${reason}`);
    this.name = 'LlmUnavailableError';
  }
}
