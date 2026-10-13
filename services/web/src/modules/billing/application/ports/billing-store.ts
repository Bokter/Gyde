import type { Plan } from '@gyde/contracts';
import type { SubscriptionSnapshot } from '../billing-event';

/** `processed`: already applied. `retry`: seen before but its processing did not finish. */
export type EventClaim = 'new' | 'retry' | 'processed';

/** `stale`: the subscription already reflects a newer event (see `isStaleEvent`). */
export type ApplySubscriptionResult = 'applied' | 'stale' | 'tenant-not-found';

export interface BillingStore {
  /** Records the event in `stripe_events` the first time; later calls report what happened. */
  claimEvent(event: { stripeEventId: string; type: string; payload: string }): Promise<EventClaim>;
  markEventProcessed(stripeEventId: string): Promise<void>;
  /** Stores the Stripe customer on the tenant. `false` when the tenant does not exist. */
  linkCustomer(tenantId: string, customerId: string): Promise<boolean>;
  findTenantIdByCustomer(customerId: string): Promise<string | null>;
  /**
   * In one transaction, locking the subscription row: skips the event when `isStaleEvent`,
   * otherwise upserts the subscription (with `occurredAt` as its last applied event) and sets the
   * tenant's plan and Stripe fields.
   */
  applySubscription(
    tenantId: string,
    subscription: SubscriptionSnapshot,
    plan: Plan,
    occurredAt: Date,
  ): Promise<ApplySubscriptionResult>;
}
