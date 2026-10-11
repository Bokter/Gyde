import { baseEnv } from '@gyde/service-kit';
import { z } from 'zod';

export const configSchema = baseEnv.extend({
  RETRIEVAL_PORT: z.coerce.number().int().positive().default(4300),
  INTERNAL_SERVICE_TOKEN: z.string().min(16),

  /** The Service Registry. Without it only the static `*_URL` below are used. */
  REGISTRY_URL: z.url().optional(),
  // Static URLs used when the Service Registry cannot resolve a service (local development).
  NORMALIZATION_URL: z.url().optional(),
  LLM_ANALYSIS_URL: z.url().optional(),
  REPORTS_URL: z.url().optional(),
});

export type Config = z.infer<typeof configSchema>;
