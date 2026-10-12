import type { Plan } from '@gyde/contracts';
import { generateApiKey } from '@/modules/api-keys/application/generate-api-key';
import type { DevSeedStore } from './ports/dev-seed-store';

/** Fixed identity, so running the seed again finds the same tenant instead of adding another. */
export const DEV_SEED_TENANT_SLUG = 'gyde-dev-seed';

export class SeedRefusedInProductionError extends Error {
  constructor() {
    super('seed:dev only runs in development: NODE_ENV is "production"');
    this.name = 'SeedRefusedInProductionError';
  }
}

export function assertNotProduction(nodeEnv: string | undefined): void {
  if (nodeEnv === 'production') throw new SeedRefusedInProductionError();
}

export type SeedDevTenantResult =
  | { status: 'created'; tenantId: string; slug: string; plan: Plan; plainKey: string }
  | { status: 'already-exists'; tenantId: string; slug: string; plan: Plan };

export class SeedDevTenant {
  constructor(private readonly store: DevSeedStore) {}

  async execute(input: { nodeEnv: string | undefined }): Promise<SeedDevTenantResult> {
    assertNotProduction(input.nodeEnv);

    const existing = await this.store.findTenantBySlug(DEV_SEED_TENANT_SLUG);
    if (existing) {
      return {
        status: 'already-exists',
        tenantId: existing.id,
        slug: existing.slug,
        plan: existing.plan,
      };
    }

    const { prefix, plainKey, keyHash, keyLast4 } = await generateApiKey('test');
    const { tenantId } = await this.store.createTenantWithApiKey({
      // `dev-seed` is not numeric, so it can never collide with a real GitHub account id.
      owner: { githubId: 'dev-seed', login: 'gyde-dev', name: 'Gyde dev' },
      tenant: { name: 'Gyde dev', slug: DEV_SEED_TENANT_SLUG, plan: 'free' },
      apiKey: { name: 'dev seed', environment: 'test', prefix, keyHash, keyLast4 },
    });
    return { status: 'created', tenantId, slug: DEV_SEED_TENANT_SLUG, plan: 'free', plainKey };
  }
}
