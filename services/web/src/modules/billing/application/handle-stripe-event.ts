import type { Plan } from '@gyde/contracts';
import { planForSubscription, type PlanPrices } from '../domain/plan-from-subscription';
import type { BillingEvent } from './billing-event';
import type { BillingStore } from './ports/billing-store';

export type StripeEventOutcome =
  | { outcome: 'applied'; tenantId: string; plan?: Plan }
  | { outcome: 'recorded' | 'duplicate' | 'ignored' | 'stale' | 'unmatched' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The webhook is the only source of truth for a studio's plan (flow 5). Every handler sets state
 * from the event instead of incrementing it, so applying an event twice is harmless: the
 * `stripe_events` log skips the ones already processed and lets a failed attempt run again.
 *
 * An `unmatched` event (no tenant found yet) stays unprocessed so the webhook can answer 500 and
 * Stripe redelivers it: a subscription event without tenant metadata can arrive before the
 * `checkout.session.completed` that links its customer.
 */
export class HandleStripeEvent {
  constructor(
    private readonly store: BillingStore,
    private readonly prices: PlanPrices,
  ) {}

  async execute(event: BillingEvent): Promise<StripeEventOutcome> {
    if (event.kind === 'ignored') return { outcome: 'ignored' };

    const claim = await this.store.claimEvent({
      stripeEventId: event.eventId,
      type: event.type,
      payload: JSON.stringify(event),
    });
    if (claim === 'processed') return { outcome: 'duplicate' };

    const result = await this.apply(event);
    if (result.outcome !== 'unmatched') await this.store.markEventProcessed(event.eventId);
    return result;
  }

  private async apply(
    event: Exclude<BillingEvent, { kind: 'ignored' }>,
  ): Promise<StripeEventOutcome> {
    switch (event.kind) {
      case 'checkout-completed': {
        if (!event.tenantId || !UUID.test(event.tenantId) || !event.customerId) {
          return { outcome: 'unmatched' };
        }
        const linked = await this.store.linkCustomer(event.tenantId, event.customerId);
        return linked ? { outcome: 'applied', tenantId: event.tenantId } : { outcome: 'unmatched' };
      }
      case 'subscription-changed': {
        const { subscription } = event;
        const tenantId =
          event.tenantId && UUID.test(event.tenantId)
            ? event.tenantId
            : await this.store.findTenantIdByCustomer(subscription.customerId);
        if (!tenantId) return { outcome: 'unmatched' };
        const plan = planForSubscription(subscription.status, subscription.priceId, this.prices);
        const result = await this.store.applySubscription(
          tenantId,
          subscription,
          plan,
          event.occurredAt,
        );
        if (result === 'stale') return { outcome: 'stale' };
        return result === 'applied'
          ? { outcome: 'applied', tenantId, plan }
          : { outcome: 'unmatched' };
      }
      case 'payment-failed':
        // Recorded only: the plan changes when Stripe updates the subscription status.
        return { outcome: 'recorded' };
    }
  }
}
