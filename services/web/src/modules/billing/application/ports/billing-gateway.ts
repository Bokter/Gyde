/** Payment provider sessions the studio is redirected to. The Stripe SDK stays in infrastructure. */
export interface CheckoutSessionRequest {
  /** Sent as `client_reference_id` and as subscription metadata, so every event finds the tenant. */
  tenantId: string;
  priceId: string;
  /** Reused when the studio already has one, so Stripe does not create a second customer. */
  customerId: string | null;
  successUrl: string;
  cancelUrl: string;
}

export interface BillingGateway {
  createCheckoutSession(request: CheckoutSessionRequest): Promise<{ url: string }>;
  createPortalSession(request: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
}
