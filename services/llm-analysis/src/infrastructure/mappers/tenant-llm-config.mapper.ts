import type { InternalLlmConfig } from '@gyde/contracts';

import type { TenantLlmConfig } from '../../application/dto/llm-analysis.dto';

/**
 * Contract -> application type, copying the four known fields by name: nothing else that Web may
 * add can travel further. The result carries the DECRYPTED key: handle it like the contract.
 */
export function toTenantLlmConfig(config: InternalLlmConfig): TenantLlmConfig {
  return {
    tenantId: config.tenantId,
    provider: config.provider,
    model: config.model,
    apiKey: config.apiKey,
  };
}
