/**
 * Errors of the BYOK flow. Messages are fixed strings: they never interpolate the key, the
 * provider's answer or anything else the studio sent.
 */
export class UnsupportedLlmProviderError extends Error {
  constructor() {
    super('LLM provider not supported');
    this.name = 'UnsupportedLlmProviderError';
  }
}

export type ConnectionTestFailure = 'invalid-key' | 'model-not-found' | 'unreachable';

export class LlmConnectionTestError extends Error {
  constructor(readonly reason: ConnectionTestFailure) {
    super(`LLM connection test failed: ${reason}`);
    this.name = 'LlmConnectionTestError';
  }
}
