import { baseEnv } from '@gyde/service-kit';
import { z } from 'zod';

export const configSchema = baseEnv.extend({
  GATEWAY_PORT: z.coerce.number().int().positive().default(4000),
  /** Shared secret for service-to-service calls. */
  INTERNAL_SERVICE_TOKEN: z.string().min(16),
  /** Service Registry used for discovery. Without it only the static `*_URL` below are used. */
  REGISTRY_URL: z.url().optional(),
  // Static URLs used when the Service Registry cannot resolve a service (local development).
  WEB_URL: z.url().optional(),
  REPORTS_URL: z.url().optional(),
  /** How long a verified API key is trusted before Web is asked again. */
  API_KEY_CACHE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  /** Requests each API key may make per minute before the gateway answers 429. */
  GATEWAY_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),
});

export type Config = z.infer<typeof configSchema>;
