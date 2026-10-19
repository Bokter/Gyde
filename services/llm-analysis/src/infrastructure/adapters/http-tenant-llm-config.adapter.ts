import { InternalLlmConfig, ROUTES, buildPath } from '@gyde/contracts';
import { type ResilientHttpClient } from '@gyde/service-kit';

import type { TenantLlmConfig } from '../../application/dto/llm-analysis.dto';
import type { TenantLlmConfigProvider } from '../../application/ports/tenant-llm-config';
import { toTenantLlmConfig } from '../mappers/tenant-llm-config.mapper';

/** How long one tenant's key may stay in memory. Nothing is ever written to disk. */
const CACHE_TTL_MS = 60_000;

/**
 * HTTP adapter of the `TenantLlmConfigProvider` port: asks Web (the owner of the BYOK keys) for
 * the DECRYPTED configuration of one tenant.
 *
 * SECURITY: the value carries a plaintext API key. It lives in memory for at most a minute, it is
 * never logged and never persisted; an invalid answer is reported as a generic error so no part
 * of it (key included) can travel further in a message.
 */
export class HttpTenantLlmConfigProvider implements TenantLlmConfigProvider {
  private readonly cache = new Map<
    string,
    { value: TenantLlmConfig | undefined; expiresAt: number }
  >();

  constructor(
    private readonly http: ResilientHttpClient,
    private readonly now: () => number = Date.now,
  ) {}

  async getConfig(tenantId: string): Promise<TenantLlmConfig | undefined> {
    const hit = this.cache.get(tenantId);
    if (hit && this.now() < hit.expiresAt) return hit.value;

    // An outage is not cached: the next analysis tries again instead of inheriting a stale failure.
    const value = await this.fetchConfig(tenantId);
    this.cache.set(tenantId, { value, expiresAt: this.now() + CACHE_TTL_MS });
    return value;
  }

  private async fetchConfig(tenantId: string): Promise<TenantLlmConfig | undefined> {
    const path = buildPath(ROUTES.web.tenantLlmConfig, { tenantId });
    const response = await this.http.fetch('web', path, { method: 'GET' });

    // The studio has not registered a key yet.
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`Web answered ${response.status} for ${path}`);

    try {
      return toTenantLlmConfig(InternalLlmConfig.parse(await response.json()));
    } catch {
      // Never propagate the parsed body: it may contain a malformed key.
      throw new Error(`Web answered an invalid LLM configuration for ${path}`);
    }
  }
}
