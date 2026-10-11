import type { LlmConfigRepository } from './ports/llm-config-repository';

/**
 * Revoking deletes the row: the ciphertext is gone, not just flagged, and llm-analysis gets a 404
 * (`llm-not-configured`) from then on.
 */
export class RevokeLlmConfig {
  constructor(private readonly repository: LlmConfigRepository) {}

  execute(tenantId: string): Promise<boolean> {
    return this.repository.deleteByTenantId(tenantId);
  }
}
