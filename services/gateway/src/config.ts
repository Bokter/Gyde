import { baseEnv } from '@gyde/service-kit';
import { z } from 'zod';

export const configSchema = baseEnv.extend({
  GATEWAY_PORT: z.coerce.number().int().positive().default(4000),
  /** Shared secret for service-to-service calls. */
  INTERNAL_SERVICE_TOKEN: z.string().min(16),
  /** Service Registry used for discovery. Optional until the registry exists. */
  REGISTRY_URL: z.url().optional(),
});

export type Config = z.infer<typeof configSchema>;
