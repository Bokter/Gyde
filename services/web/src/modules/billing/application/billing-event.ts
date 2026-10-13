/**
 * The Stripe events billing reacts to, already verified and reduced to the fields it needs.
 * Stripe's own types stay in infrastructure; nothing here carries customer personal data.
 */
interface EventBase {
  eventId: string;
  type: string;
  /** Stripe's `created`: when the event happened, not when it was delivered. */
  occurredAt: Date;
}

export interface SubscriptionSnapshot {
  subscriptionId: string;
  customerId: string;
  priceId: string | null;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
}

export type BillingEvent =
  | (EventBase & {
      kind: 'checkout-completed';
      /** `client_reference_id` of the Checkout session: the tenant that started it. */
      tenantId: string | null;
      customerId: string | null;
    })
  | (EventBase & {
      kind: 'subscription-changed';
      /** `metadata.tenantId` of the subscription, when Checkout set it. */
      tenantId: string | null;
      subscription: SubscriptionSnapshot;
    })
  | (EventBase & { kind: 'payment-failed'; customerId: string | null })
  | (EventBase & { kind: 'ignored'; reason: 'unhandled-type' | 'livemode' });
