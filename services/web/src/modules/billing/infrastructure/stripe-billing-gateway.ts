import Stripe from 'stripe';
import type { BillingGateway, CheckoutSessionRequest } from '../application/ports/billing-gateway';
import { StripeLiveKeyRefusedError } from '../domain/errors';

/** Creates Checkout and portal sessions with the Stripe SDK. Refuses anything but a test key. */
export class StripeBillingGateway implements BillingGateway {
  private readonly stripe: Stripe;

  /** `config` lets tests swap the HTTP client; production uses the SDK defaults. */
  constructor(secretKey: string, config?: Stripe.StripeConfig) {
    if (!secretKey.startsWith('sk_test_')) throw new StripeLiveKeyRefusedError();
    this.stripe = new Stripe(secretKey, config);
  }

  async createCheckoutSession(request: CheckoutSessionRequest): Promise<{ url: string }> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: request.priceId, quantity: 1 }],
      // Both carry the tenant: Stripe may deliver `customer.subscription.created` before
      // `checkout.session.completed`, and the subscription event only has its own metadata.
      client_reference_id: request.tenantId,
      subscription_data: { metadata: { tenantId: request.tenantId } },
      ...(request.customerId ? { customer: request.customerId } : {}),
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
    });
    if (!session.url) throw new Error('Stripe returned a Checkout session without a URL');
    return { url: session.url };
  }

  async createPortalSession(request: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: request.customerId,
      return_url: request.returnUrl,
    });
    return { url: session.url };
  }
}
