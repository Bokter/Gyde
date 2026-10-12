import Stripe from 'stripe';
import type { BillingEvent, SubscriptionSnapshot } from '../application/billing-event';
import type { StripeEventVerifier } from '../application/ports/stripe-event-verifier';
import { InvalidStripeSignatureError } from '../domain/errors';

const idOf = (value: string | { id: string } | null | undefined): string | null =>
  value == null ? null : typeof value === 'string' ? value : value.id;

const fromUnix = (seconds: number) => new Date(seconds * 1000);

/** Present on the subscription up to API 2025-02-24; on each item from 2025-03-31 (basil). */
interface BillingPeriod {
  current_period_start?: number;
  current_period_end?: number;
}

function snapshot(subscription: Stripe.Subscription): SubscriptionSnapshot {
  const item = subscription.items.data[0] as (Stripe.SubscriptionItem & BillingPeriod) | undefined;
  const legacy = subscription as Stripe.Subscription & BillingPeriod;
  const start = legacy.current_period_start ?? item?.current_period_start;
  const end = legacy.current_period_end ?? item?.current_period_end;
  if (start === undefined || end === undefined) {
    throw new Error('Stripe subscription event without a billing period');
  }
  return {
    subscriptionId: subscription.id,
    customerId: idOf(subscription.customer)!,
    priceId: item?.price.id ?? null,
    status: subscription.status,
    currentPeriodStart: fromUnix(start),
    currentPeriodEnd: fromUnix(end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    canceledAt: subscription.canceled_at ? fromUnix(subscription.canceled_at) : null,
  };
}

/**
 * Checks the `Stripe-Signature` header with the official SDK (HMAC-SHA256 over the raw body,
 * with the SDK's default 5-minute tolerance) and maps the event to a `BillingEvent`. Gyde only
 * runs Stripe in test mode, so live-mode events are ignored.
 */
export class StripeWebhookVerifier implements StripeEventVerifier {
  constructor(private readonly webhookSecret: string) {}

  verify(rawBody: string, signature: string | null): BillingEvent {
    if (!signature) throw new InvalidStripeSignatureError();
    let event: Stripe.Event;
    try {
      event = Stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch {
      throw new InvalidStripeSignatureError();
    }

    const base = { eventId: event.id, type: event.type, occurredAt: fromUnix(event.created) };
    if (event.livemode) return { ...base, kind: 'ignored', reason: 'livemode' };

    switch (event.type) {
      case 'checkout.session.completed':
        return {
          ...base,
          kind: 'checkout-completed',
          tenantId: event.data.object.client_reference_id,
          customerId: idOf(event.data.object.customer),
        };
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        return {
          ...base,
          kind: 'subscription-changed',
          tenantId: event.data.object.metadata?.tenantId ?? null,
          subscription: snapshot(event.data.object),
        };
      case 'invoice.payment_failed':
        return { ...base, kind: 'payment-failed', customerId: idOf(event.data.object.customer) };
      default:
        return { ...base, kind: 'ignored', reason: 'unhandled-type' };
    }
  }
}
