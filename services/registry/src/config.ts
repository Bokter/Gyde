import { baseEnv } from '@gyde/service-kit';
import { z } from 'zod';

export const configSchema = baseEnv.extend({
  REGISTRY_PORT: z.coerce.number().int().positive().default(4100),
  /** Only our own services may register or resolve. */
  INTERNAL_SERVICE_TOKEN: z.string().min(16),
  /** An instance without heartbeat for this long is considered gone. */
  INSTANCE_TTL_MS: z.coerce.number().int().positive().default(15_000),
  /** How often the Health Checker probes every registered instance. */
  HEALTH_CHECK_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
  /** Consecutive failed probes before an instance is removed from the registry. */
  HEALTH_CHECK_MAX_FAILURES: z.coerce.number().int().positive().default(3),
});

export type Config = z.infer<typeof configSchema>;
