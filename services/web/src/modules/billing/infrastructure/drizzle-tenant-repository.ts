import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/lib/db/schema';
import type { Tenant } from '../domain/entities';
import type { TenantRepository } from '../domain/repositories';

const pool = new Pool({
  connectionString: process.env.WEB_DATABASE_URL,
  max: 10,
});

const db = drizzle(pool, { schema });

export class DrizzleTenantRepository implements TenantRepository {
  async findByOwnerId(ownerId: string): Promise<Tenant | null> {
    const result = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.ownerId, ownerId))
      .limit(1);
    return this.mapTenant(result[0]) || null;
  }

  async findById(id: string): Promise<Tenant | null> {
    const result = await db.select().from(schema.tenants).where(eq(schema.tenants.id, id)).limit(1);
    return this.mapTenant(result[0]) || null;
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const result = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, slug))
      .limit(1);
    return this.mapTenant(result[0]) || null;
  }

  async findByStripeCustomerId(customerId: string): Promise<Tenant | null> {
    const result = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.stripeCustomerId, customerId))
      .limit(1);
    return this.mapTenant(result[0]) || null;
  }

  async create(tenant: Omit<Tenant, 'id' | 'createdAt' | 'updatedAt'>): Promise<Tenant> {
    const result = await db
      .insert(schema.tenants)
      .values({
        name: tenant.name,
        slug: tenant.slug,
        ownerId: tenant.ownerId,
        plan: tenant.plan,
        stripeCustomerId: tenant.stripeCustomerId,
        stripeSubscriptionId: tenant.stripeSubscriptionId,
        stripePriceId: tenant.stripePriceId,
        stripeCurrentPeriodEnd: tenant.stripeCurrentPeriodEnd,
        stripeCancelAtPeriodEnd: tenant.stripeCancelAtPeriodEnd ?? false,
      })
      .returning();
    return this.mapTenant(result[0])!;
  }

  async update(id: string, data: Partial<Tenant>): Promise<Tenant> {
    const result = await db
      .update(schema.tenants)
      .set(data)
      .where(eq(schema.tenants.id, id))
      .returning();
    return this.mapTenant(result[0])!;
  }

  private mapTenant(row: typeof schema.tenants.$inferSelect | undefined): Tenant | null {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      ownerId: row.ownerId,
      plan: row.plan as 'free' | 'pro' | 'studio',
      stripeCustomerId: row.stripeCustomerId,
      stripeSubscriptionId: row.stripeSubscriptionId,
      stripePriceId: row.stripePriceId,
      stripeCurrentPeriodEnd: row.stripeCurrentPeriodEnd,
      stripeCancelAtPeriodEnd: row.stripeCancelAtPeriodEnd ?? false,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
