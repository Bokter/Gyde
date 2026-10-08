import { baseEnv } from '@gyde/service-kit';
import { z } from 'zod';

export const configSchema = baseEnv.extend({
  REPORTS_PORT: z.coerce.number().int().positive().default(4500),
  INTERNAL_SERVICE_TOKEN: z.string().min(16),
  /** Schema `reports` of the shared PostgreSQL (role `reports`). */
  REPORTS_DATABASE_URL: z.string().optional(),

  /** Static URL used when the Service Registry cannot resolve Retrieval (local development). */
  RETRIEVAL_URL: z.url().optional(),
  /** A report whose AI result does not arrive within this time becomes ready and degraded. */
  REPORTS_AI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
});

export type Config = z.infer<typeof configSchema>;
