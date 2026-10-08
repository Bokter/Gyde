import { z } from 'zod';

import { Id, IsoDateTime } from './common';

/** LLM providers a studio can bring its own key for (BYOK). Extend through a reviewed PR. */
export const LlmProvider = z.enum(['anthropic', 'openai']);
export type LlmProvider = z.infer<typeof LlmProvider>;

/** Body used by a studio to register its key. `apiKey` is write-only: it is never returned. */
export const LlmProviderConfigInput = z.strictObject({
  provider: LlmProvider,
  model: z.string().min(1).max(100),
  apiKey: z.string().min(8).max(500),
});
export type LlmProviderConfigInput = z.infer<typeof LlmProviderConfigInput>;

/** What the dashboard may show about a stored key. */
export const LlmProviderConfigView = z.strictObject({
  id: Id,
  provider: LlmProvider,
  model: z.string().min(1).max(100),
  keyLast4: z.string().length(4),
  status: z.enum(['active', 'invalid', 'revoked']),
  createdAt: IsoDateTime,
  rotatedAt: IsoDateTime.optional(),
});
export type LlmProviderConfigView = z.infer<typeof LlmProviderConfigView>;

/**
 * INTERNAL ONLY: carries a DECRYPTED secret (Web → llm-analysis, GET
 * /internal/tenants/:tenantId/llm-config). Never log it, never persist it, never expose it
 * through the gateway, and keep it in memory only for the duration of the call.
 */
export const InternalLlmConfig = z.strictObject({
  tenantId: Id,
  provider: LlmProvider,
  model: z.string().min(1).max(100),
  apiKey: z.string().min(8).max(500),
});
export type InternalLlmConfig = z.infer<typeof InternalLlmConfig>;
