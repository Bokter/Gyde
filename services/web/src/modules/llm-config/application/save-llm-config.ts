import type { LlmProviderConfigInput, LlmProviderConfigView } from '@gyde/contracts';
import { SUPPORTED_LLM_PROVIDERS } from '../domain/entities';
import { LlmConnectionTestError, UnsupportedLlmProviderError } from '../domain/errors';
import { toLlmConfigView } from './llm-config-view';
import type { LlmConfigRepository } from './ports/llm-config-repository';
import type { LlmConnectionTester } from './ports/llm-connection-tester';
import type { LlmKeyCipher } from './ports/llm-key-cipher';

/** Registers or replaces the studio's key: test it, encrypt it, store it. */
export class SaveLlmConfig {
  constructor(
    private readonly repository: LlmConfigRepository,
    private readonly cipher: LlmKeyCipher,
    private readonly tester: LlmConnectionTester,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(tenantId: string, input: LlmProviderConfigInput): Promise<LlmProviderConfigView> {
    if (!SUPPORTED_LLM_PROVIDERS.includes(input.provider)) {
      throw new UnsupportedLlmProviderError();
    }

    const result = await this.tester.test(input);
    if (!result.ok) throw new LlmConnectionTestError(result.reason);

    const previous = await this.repository.findByTenantId(tenantId);
    const now = this.now();
    const saved = await this.repository.upsert({
      tenantId,
      provider: input.provider,
      model: input.model,
      keyLast4: input.apiKey.slice(-4),
      secret: this.cipher.encrypt(input.apiKey, tenantId),
      status: 'active',
      lastTestedAt: now,
      rotatedAt: previous ? now : null,
    });
    return toLlmConfigView(saved);
  }
}
