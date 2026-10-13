import type { LlmProvider, LlmProviderConfigInput } from '@gyde/contracts';
import type {
  ConnectionTestResult,
  LlmConnectionTester,
} from '../application/ports/llm-connection-tester';

/**
 * Tests a key with the tester of ITS provider, so a Gemini key is never sent to Anthropic (or the
 * other way round). A provider with no tester is `unreachable`: nothing is sent anywhere.
 */
export class ProviderConnectionTester implements LlmConnectionTester {
  constructor(private readonly testers: Partial<Record<LlmProvider, LlmConnectionTester>>) {}

  async test(config: LlmProviderConfigInput): Promise<ConnectionTestResult> {
    const tester = Object.hasOwn(this.testers, config.provider)
      ? this.testers[config.provider]
      : undefined;
    return tester ? tester.test(config) : { ok: false, reason: 'unreachable' };
  }
}
