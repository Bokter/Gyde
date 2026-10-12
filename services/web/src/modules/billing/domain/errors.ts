/** The webhook body was not signed with `STRIPE_WEBHOOK_SECRET` (or the signature is stale). */
export class InvalidStripeSignatureError extends Error {
  constructor() {
    super('Invalid Stripe webhook signature');
    this.name = 'InvalidStripeSignatureError';
  }
}
