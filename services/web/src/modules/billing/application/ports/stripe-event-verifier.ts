import type { BillingEvent } from '../billing-event';

export interface StripeEventVerifier {
  /** Throws `InvalidStripeSignatureError` unless `rawBody` carries a valid Stripe signature. */
  verify(rawBody: string, signature: string | null): BillingEvent;
}
