import type { LlmProviderConfigInput } from '@gyde/contracts';
import type {
  ConnectionTestResult,
  LlmConnectionTester,
} from '../application/ports/llm-connection-tester';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';
const TIMEOUT_MS = 10_000;

/** The model name goes into the URL path: only plain model ids are allowed there. */
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export interface GeminiConnectionTesterOptions {
  /** Injectable for tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Overridable so tests never reach the real API. */
  baseUrl?: string;
}

/**
 * Real check against Gemini: `GET /v1beta/models/{model}` with the studio's key. It spends no
 * tokens and validates the key and the model at once. The key travels in the `x-goog-api-key`
 * header, never in the URL. Nothing the provider answers is read or kept: only a fixed reason
 * leaves this class.
 */
export class GeminiConnectionTester implements LlmConnectionTester {
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;

  constructor(options: GeminiConnectionTesterOptions = {}) {
    this.fetchFn = options.fetch ?? fetch;
    this.baseUrl = (options.baseUrl ?? GEMINI_BASE_URL).replace(/\/$/, '');
  }

  async test({ model, apiKey }: LlmProviderConfigInput): Promise<ConnectionTestResult> {
    const id = model.replace(/^models\//, '');
    if (!MODEL_ID.test(id)) return { ok: false, reason: 'model-not-found' };

    try {
      const response = await this.fetchFn(`${this.baseUrl}/v1beta/models/${id}`, {
        headers: { 'x-goog-api-key': apiKey },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.ok) return { ok: true };
      // Gemini answers 400 ("API key not valid"), 401 or 403 for a key it does not accept.
      if ([400, 401, 403].includes(response.status)) return { ok: false, reason: 'invalid-key' };
      if (response.status === 404) return { ok: false, reason: 'model-not-found' };
      return { ok: false, reason: 'unreachable' };
    } catch {
      return { ok: false, reason: 'unreachable' };
    }
  }
}
