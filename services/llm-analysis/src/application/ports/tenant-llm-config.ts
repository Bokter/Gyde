import type { InternalLlmConfig } from '@gyde/contracts';

/**
 * Port to the tenant's LLM configuration (BYOK). The adapter calls the Servicio Web internal
 * endpoint `GET /internal/tenants/:tenantId/llm-config`.
 *
 * SECURITY: the returned config carries a DECRYPTED API key. Use it for the duration of one call,
 * never write it to logs, disk or an error message, and if you cache it keep it in memory for at
 * most a minute.
 */
export interface TenantLlmConfigProvider {
  /** `undefined` when the tenant has not configured a key yet. */
  getConfig(tenantId: string): Promise<InternalLlmConfig | undefined>;
}

/** DI token of the `TenantLlmConfigProvider` port: `app.module.ts` binds it to an adapter (see ADR 0011). */
export const TENANT_LLM_CONFIG_PROVIDER = Symbol('TenantLlmConfigProvider');
