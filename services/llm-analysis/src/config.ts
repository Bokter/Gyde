import { baseEnv } from '@gyde/service-kit';
import { z } from 'zod';

export const configSchema = baseEnv.extend({
  LLM_ANALYSIS_PORT: z.coerce.number().int().positive().default(4400),
  INTERNAL_SERVICE_TOKEN: z.string().min(16),

  // Static URLs used when the Service Registry cannot resolve a service (local development).
  /** Servicio Web: source of each tenant's LLM configuration (BYOK). */
  WEB_URL: z.url().optional(),
  REPORTS_URL: z.url().optional(),

  /** Development only: answer with the mock provider when a tenant has no LLM key. */
  LLM_MOCK_ENABLED: z.stringbool().default(false),
});

export type Config = z.infer<typeof configSchema>;
