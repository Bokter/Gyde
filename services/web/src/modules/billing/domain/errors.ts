/** The webhook body was not signed with `STRIPE_WEBHOOK_SECRET` (or the signature is stale). */
export class InvalidStripeSignatureError extends Error {
  constructor() {
    super('Invalid Stripe webhook signature');
    this.name = 'InvalidStripeSignatureError';
  }
}

/** The studio has no Stripe customer yet: there is nothing to manage in the portal. */
export class NoStripeCustomerError extends Error {
  constructor() {
    super('The tenant has no Stripe customer');
    this.name = 'NoStripeCustomerError';
  }
}

/** Gyde only runs Stripe in test mode: a live or unknown secret key is refused. */
export class StripeLiveKeyRefusedError extends Error {
  constructor() {
    super('STRIPE_SECRET_KEY must be a test-mode key (sk_test_)');
    this.name = 'StripeLiveKeyRefusedError';
  }
}
