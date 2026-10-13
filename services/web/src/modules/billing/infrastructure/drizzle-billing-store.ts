import type { Plan } from '@gyde/contracts';
import { desc, eq } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';
import type { Database } from '@/infrastructure/db/database';
import type { SubscriptionSnapshot } from '../application/billing-event';
import type { BillingAccount, BillingAccounts } from '../application/ports/billing-accounts';
import type {
  ApplySubscriptionResult,
  BillingStore,
  EventClaim,
} from '../application/ports/billing-store';
import { isStaleEvent } from '../domain/event-order';

export class DrizzleBillingStore implements BillingStore, BillingAccounts {
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
    occurredAt: Date,
  ): Promise<ApplySubscriptionResult> {
    return this.db.transaction(async (tx) => {
      // The row lock serialises concurrent deliveries for the same subscription.
      const [current] = await tx
        .select({
          lastEventAt: schema.subscriptions.lastEventAt,
          status: schema.subscriptions.status,
        })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.stripeSubscriptionId, subscription.subscriptionId))
        .for('update');
      const last = current?.lastEventAt
        ? { occurredAt: current.lastEventAt, status: current.status }
        : null;
      if (isStaleEvent(last, { occurredAt, status: subscription.status })) return 'stale';

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
      if (tenant.length === 0) return 'tenant-not-found';

      const row = {
        tenantId,
        stripeCustomerId: subscription.customerId,
        stripePriceId: subscription.priceId ?? '',
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        canceledAt: subscription.canceledAt,
        lastEventAt: occurredAt,
        updatedAt: now,
      };
      await tx
        .insert(schema.subscriptions)
        .values({ ...row, stripeSubscriptionId: subscription.subscriptionId })
        .onConflictDoUpdate({ target: schema.subscriptions.stripeSubscriptionId, set: row });
      return 'applied';
    });
  }

  async tenantIdForUser(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(eq(schema.tenants.ownerId, userId))
      .limit(1);
    return row?.id ?? null;
  }

  async find(tenantId: string): Promise<BillingAccount | null> {
    const [tenant] = await this.db
      .select({ plan: schema.tenants.plan, stripeCustomerId: schema.tenants.stripeCustomerId })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);
    if (!tenant) return null;

    const [subscription] = await this.db
      .select({
        status: schema.subscriptions.status,
        priceId: schema.subscriptions.stripePriceId,
        currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
        cancelAtPeriodEnd: schema.subscriptions.cancelAtPeriodEnd,
      })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.tenantId, tenantId))
      .orderBy(desc(schema.subscriptions.updatedAt))
      .limit(1);

    return {
      tenantId,
      plan: tenant.plan as Plan,
      stripeCustomerId: tenant.stripeCustomerId,
      subscription: subscription
        ? {
            status: subscription.status,
            priceId: subscription.priceId || null,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
          }
        : null,
    };
  }
}
