import Anthropic from '@anthropic-ai/sdk';
import type { LlmProviderConfigInput } from '@gyde/contracts';
import type {
  ConnectionTestResult,
  LlmConnectionTester,
} from '../application/ports/llm-connection-tester';

const TIMEOUT_MS = 10_000;

/**
 * Real check against Anthropic: `GET /v1/models/{model}` with the studio's key. It spends no
 * tokens and validates the key and the model at once. The SDK error is never logged or
 * rethrown: only a fixed reason leaves this class.
 */
export class AnthropicConnectionTester implements LlmConnectionTester {
  async test({ model, apiKey }: LlmProviderConfigInput): Promise<ConnectionTestResult> {
    const client = new Anthropic({ apiKey, maxRetries: 0, timeout: TIMEOUT_MS });
    try {
      await client.models.retrieve(model);
      return { ok: true };
    } catch (error) {
      if (
        error instanceof Anthropic.AuthenticationError ||
        error instanceof Anthropic.PermissionDeniedError
      ) {
        return { ok: false, reason: 'invalid-key' };
      }
      if (error instanceof Anthropic.NotFoundError) return { ok: false, reason: 'model-not-found' };
      return { ok: false, reason: 'unreachable' };
    }
  }
}
