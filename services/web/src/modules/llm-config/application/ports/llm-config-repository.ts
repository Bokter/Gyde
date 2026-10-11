import type { LlmConfig, NewLlmConfig } from '../../domain/entities';

/** One configuration per tenant (unique `tenant_id`). */
export interface LlmConfigRepository {
  findByTenantId(tenantId: string): Promise<LlmConfig | null>;
  /** Inserts or replaces the tenant's configuration. */
  upsert(config: NewLlmConfig): Promise<LlmConfig>;
  /** Deletes it (and with it the ciphertext). `false` when there was nothing to delete. */
  deleteByTenantId(tenantId: string): Promise<boolean>;
}
