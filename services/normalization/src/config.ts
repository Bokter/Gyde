import { baseEnv } from '@gyde/service-kit';
import { z } from 'zod';

export const configSchema = baseEnv.extend({
  NORMALIZATION_PORT: z.coerce.number().int().positive().default(4200),
  INTERNAL_SERVICE_TOKEN: z.string().min(16),
  /** Schema `normalization` of the shared PostgreSQL (role `normalization`). */
  NORMALIZATION_DATABASE_URL: z.string().optional(),

  /** Read sources from /fixtures instead of the network (offline development and demos). */
  INGEST_USE_FIXTURES: z.stringbool().default(true),
  /** Where the fixtures live (`fixtures/sources` of the repository; copied into the image). */
  INGEST_FIXTURES_DIR: z.string().default('../../fixtures/sources'),
  /** High-trust sources (CVE / GHSA / OSV / NVD) refresh often. */
  INGEST_HIGH_TRUST_CRON: z.string().default('0 * * * *'),
  /** Community signals (GitHub Issues, forums) are costlier to filter and less reliable: slower. */
  INGEST_COMMUNITY_CRON: z.string().default('0 3 * * *'),

  OSV_API_URL: z.url().default('https://api.osv.dev'),
  /** Static OSV bucket that lists, per ecosystem, which advisories changed. */
  OSV_BUCKET_URL: z.url().default('https://osv-vulnerabilities.storage.googleapis.com'),
  NVD_API_URL: z.url().default('https://services.nvd.nist.gov/rest/json/cves/2.0'),
  NVD_API_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;
