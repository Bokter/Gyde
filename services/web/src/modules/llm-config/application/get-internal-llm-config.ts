import type { InternalLlmConfig } from '@gyde/contracts';
import type { LlmConfigRepository } from './ports/llm-config-repository';
import type { LlmKeyCipher } from './ports/llm-key-cipher';

/**
 * INTERNAL ONLY: returns the DECRYPTED key for llm-analysis. Never log the result and never send
 * it anywhere but the internal endpoint.
 */
export class GetInternalLlmConfig {
  constructor(
    private readonly repository: LlmConfigRepository,
    private readonly cipher: LlmKeyCipher,
  ) {}

  async execute(tenantId: string): Promise<InternalLlmConfig | null> {
    const config = await this.repository.findByTenantId(tenantId);
    if (!config || config.status !== 'active') return null;
    return {
      tenantId,
      provider: config.provider,
      model: config.model,
      apiKey: this.cipher.decrypt(config.secret, tenantId),
    };
  }
}
