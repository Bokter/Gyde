import type { LlmProviderConfigInput } from '@gyde/contracts';
import type {
  ConnectionTestResult,
  LlmConnectionTester,
} from '../application/ports/llm-connection-tester';

const ANTHROPIC_KEY_SHAPE = /^sk-ant-[A-Za-z0-9_-]{20,}$/;

/**
 * For demos and local development without network (`LLM_CONNECTION_TESTER=offline`): checks only
 * the shape of the key and of the model name. It never contacts the provider, so a wrong key is
 * only found later, when llm-analysis uses it (`llm-error`).
 */
export class OfflineConnectionTester implements LlmConnectionTester {
  async test({ model, apiKey }: LlmProviderConfigInput): Promise<ConnectionTestResult> {
    if (!ANTHROPIC_KEY_SHAPE.test(apiKey)) return { ok: false, reason: 'invalid-key' };
    if (!model.startsWith('claude-')) return { ok: false, reason: 'model-not-found' };
    return { ok: true };
  }
}
