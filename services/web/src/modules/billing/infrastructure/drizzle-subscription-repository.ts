import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/lib/db/schema';
import type { Subscription } from '../domain/entities';
import type { SubscriptionRepository } from '../domain/repositories';

const pool = new Pool({
  connectionString: process.env.WEB_DATABASE_URL,
  max: 10,
});

const db = drizzle(pool, { schema });

export class DrizzleSubscriptionRepository implements SubscriptionRepository {
  async findByTenantId(tenantId: string): Promise<Subscription | null> {
    const result = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.tenantId, tenantId))
      .limit(1);
    return this.mapSubscription(result[0]) || null;
  }

  async findByStripeSubscriptionId(subscriptionId: string): Promise<Subscription | null> {
    const result = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.stripeSubscriptionId, subscriptionId))
      .limit(1);
    return this.mapSubscription(result[0]) || null;
  }

  async create(
    subscription: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Subscription> {
    const result = await db
      .insert(schema.subscriptions)
      .values({
        tenantId: subscription.tenantId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        stripeCustomerId: subscription.stripeCustomerId,
        stripePriceId: subscription.stripePriceId,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
        canceledAt: subscription.canceledAt,
      })
      .returning();
    return this.mapSubscription(result[0])!;
  }

  async update(id: string, data: Partial<Subscription>): Promise<Subscription> {
    const result = await db
      .update(schema.subscriptions)
      .set(data)
      .where(eq(schema.subscriptions.id, id))
      .returning();
    return this.mapSubscription(result[0])!;
  }

  private mapSubscription(
    row: typeof schema.subscriptions.$inferSelect | undefined,
  ): Subscription | null {
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenantId,
      stripeSubscriptionId: row.stripeSubscriptionId,
      stripeCustomerId: row.stripeCustomerId,
      stripePriceId: row.stripePriceId,
      status: row.status,
      currentPeriodStart: row.currentPeriodStart,
      currentPeriodEnd: row.currentPeriodEnd,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd ?? false,
      canceledAt: row.canceledAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
