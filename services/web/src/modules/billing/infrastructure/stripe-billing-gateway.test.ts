import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { StripeLiveKeyRefusedError } from '../domain/errors';
import { StripeBillingGateway } from './stripe-billing-gateway';

const TENANT = '22222222-2222-4222-8222-222222222222';

describe('StripeBillingGateway', () => {
  it('refuses any key that is not a test-mode key', () => {
    for (const key of ['sk_live_abc', 'rk_live_abc', 'pk_test_abc', '']) {
      expect(() => new StripeBillingGateway(key)).toThrow(StripeLiveKeyRefusedError);
    }
  });

  it('puts the tenant on the Checkout session and on the subscription it creates', async () => {
    const bodies: URLSearchParams[] = [];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      bodies.push(new URLSearchParams(String(init.body)));
      return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.test/cs' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const gateway = new StripeBillingGateway('sk_test_unit', {
      httpClient: Stripe.createFetchHttpClient(fakeFetch),
      maxNetworkRetries: 0,
    });

    const session = await gateway.createCheckoutSession({
      tenantId: TENANT,
      priceId: 'price_pro_test',
      customerId: null,
      successUrl: 'http://web/dashboard/billing?checkout=success',
      cancelUrl: 'http://web/dashboard/billing?checkout=cancelled',
    });

    expect(session.url).toBe('https://checkout.test/cs');
    const body = bodies[0]!;
    expect(body.get('mode')).toBe('subscription');
    expect(body.get('client_reference_id')).toBe(TENANT);
    // Without it, `customer.subscription.created` arriving first would match no tenant.
    expect(body.get('subscription_data[metadata][tenantId]')).toBe(TENANT);
    expect(body.get('line_items[0][price]')).toBe('price_pro_test');
  });
});
