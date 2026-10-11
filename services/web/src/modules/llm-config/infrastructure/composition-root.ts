import { DrizzleTenantRepository } from '@/modules/billing/infrastructure/drizzle-tenant-repository';
import { GetInternalLlmConfig } from '../application/get-internal-llm-config';
import { GetLlmConfigView } from '../application/get-llm-config-view';
import type { LlmConnectionTester } from '../application/ports/llm-connection-tester';
import { RevokeLlmConfig } from '../application/revoke-llm-config';
import { SaveLlmConfig } from '../application/save-llm-config';
import { AesGcmLlmKeyCipher } from './aes-gcm-llm-key-cipher';
import { AnthropicConnectionTester } from './anthropic-connection-tester';
import { DrizzleLlmConfigRepository } from './drizzle-llm-config-repository';
import { OfflineConnectionTester } from './offline-connection-tester';

export interface LlmConfigModule {
  save: SaveLlmConfig;
  view: GetLlmConfigView;
  revoke: RevokeLlmConfig;
  internal: GetInternalLlmConfig;
  /** Tenant owned by the signed-in user, or `null`. */
  tenantIdForUser(userId: string): Promise<string | null>;
}

function connectionTester(): LlmConnectionTester {
  const mode = process.env.LLM_CONNECTION_TESTER ?? 'anthropic';
  if (mode === 'offline') return new OfflineConnectionTester();
  if (mode === 'anthropic') return new AnthropicConnectionTester();
  throw new Error('LLM_CONNECTION_TESTER must be "anthropic" or "offline"');
}

let instance: LlmConfigModule | undefined;

/**
 * Built on first use, not at import: `next build` loads route modules without the runtime
 * secrets, and a missing master key must fail the request, not the build.
 */
export function llmConfigModule(): LlmConfigModule {
  if (instance) return instance;
  const repository = new DrizzleLlmConfigRepository();
  const cipher = AesGcmLlmKeyCipher.fromConfig(
    process.env.LLM_KEY_ENCRYPTION_KEYS,
    process.env.LLM_KEY_ACTIVE_KID,
  );
  const tenants = new DrizzleTenantRepository();
  instance = {
    save: new SaveLlmConfig(repository, cipher, connectionTester()),
    view: new GetLlmConfigView(repository),
    revoke: new RevokeLlmConfig(repository),
    internal: new GetInternalLlmConfig(repository, cipher),
    tenantIdForUser: async (userId) => (await tenants.findByOwnerId(userId))?.id ?? null,
  };
  return instance;
}
