import type { LlmProviderConfigView } from '@gyde/contracts';
import type { LlmConfig } from '../domain/entities';

/** What the dashboard may see: built field by field, never the secret. */
export function toLlmConfigView(config: LlmConfig): LlmProviderConfigView {
  return {
    id: config.id,
    provider: config.provider,
    model: config.model,
    keyLast4: config.keyLast4,
    status: config.status,
    createdAt: config.createdAt.toISOString(),
    ...(config.rotatedAt ? { rotatedAt: config.rotatedAt.toISOString() } : {}),
  };
}
