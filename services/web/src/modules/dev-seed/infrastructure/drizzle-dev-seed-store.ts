import type { Plan } from '@gyde/contracts';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/lib/db/schema';
import type { DevSeedStore, DevSeedTenant, NewDevSeed } from '../application/ports/dev-seed-store';

export class DrizzleDevSeedStore implements DevSeedStore {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async findTenantBySlug(slug: string): Promise<DevSeedTenant | null> {
    const [row] = await this.db
      .select({ id: schema.tenants.id, slug: schema.tenants.slug, plan: schema.tenants.plan })
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, slug))
      .limit(1);
    return row ? { ...row, plan: row.plan as Plan } : null;
  }

  async createTenantWithApiKey(seed: NewDevSeed): Promise<{ tenantId: string; apiKeyId: string }> {
    return this.db.transaction(async (tx) => {
      // Reuses the seed user if a previous tenant of it was deleted by hand.
      const [owner] = await tx
        .insert(schema.users)
        .values(seed.owner)
        .onConflictDoUpdate({ target: schema.users.githubId, set: { updatedAt: new Date() } })
        .returning({ id: schema.users.id });
      const [tenant] = await tx
        .insert(schema.tenants)
        .values({ ...seed.tenant, ownerId: owner!.id })
        .returning({ id: schema.tenants.id });
      const [apiKey] = await tx
        .insert(schema.apiKeys)
        .values({ ...seed.apiKey, tenantId: tenant!.id })
        .returning({ id: schema.apiKeys.id });
      return { tenantId: tenant!.id, apiKeyId: apiKey!.id };
    });
  }
}
