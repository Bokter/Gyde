import type { Plan } from '@gyde/contracts';
import { eq } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';
import type { Database } from '@/infrastructure/db/database';
import type { SubscriptionSnapshot } from '../application/billing-event';
import type { BillingStore, EventClaim } from '../application/ports/billing-store';

export class DrizzleBillingStore implements BillingStore {
  constructor(private readonly db: Database) {}

  async claimEvent(event: {
    stripeEventId: string;
    type: string;
    payload: string;
  }): Promise<EventClaim> {
    const inserted = await this.db
      .insert(schema.stripeEvents)
      .values(event)
      .onConflictDoNothing({ target: schema.stripeEvents.stripeEventId })
      .returning({ id: schema.stripeEvents.id });
    if (inserted.length > 0) return 'new';

    const [existing] = await this.db
      .select({ processed: schema.stripeEvents.processed })
      .from(schema.stripeEvents)
      .where(eq(schema.stripeEvents.stripeEventId, event.stripeEventId))
      .limit(1);
    return existing?.processed ? 'processed' : 'retry';
  }

  async markEventProcessed(stripeEventId: string): Promise<void> {
    await this.db
      .update(schema.stripeEvents)
      .set({ processed: true, processedAt: new Date() })
      .where(eq(schema.stripeEvents.stripeEventId, stripeEventId));
  }

  async linkCustomer(tenantId: string, customerId: string): Promise<boolean> {
    const updated = await this.db
      .update(schema.tenants)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(schema.tenants.id, tenantId))
      .returning({ id: schema.tenants.id });
    return updated.length > 0;
  }

  async findTenantIdByCustomer(customerId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(eq(schema.tenants.stripeCustomerId, customerId))
      .limit(1);
    return row?.id ?? null;
  }

  async applySubscription(
    tenantId: string,
    subscription: SubscriptionSnapshot,
    plan: Plan,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const tenant = await tx
        .update(schema.tenants)
        .set({
          plan,
          stripeCustomerId: subscription.customerId,
          stripeSubscriptionId: subscription.subscriptionId,
          stripePriceId: subscription.priceId,
          stripeCurrentPeriodEnd: subscription.currentPeriodEnd,
          stripeCancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          updatedAt: now,
        })
        .where(eq(schema.tenants.id, tenantId))
        .returning({ id: schema.tenants.id });
      if (tenant.length === 0) return false;

      const row = {
        tenantId,
        stripeCustomerId: subscription.customerId,
        stripePriceId: subscription.priceId ?? '',
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        canceledAt: subscription.canceledAt,
        updatedAt: now,
      };
      await tx
        .insert(schema.subscriptions)
        .values({ ...row, stripeSubscriptionId: subscription.subscriptionId })
        .onConflictDoUpdate({ target: schema.subscriptions.stripeSubscriptionId, set: row });
      return true;
    });
  }
}
