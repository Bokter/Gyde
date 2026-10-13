import { describe, expect, it } from 'vitest';
import type { BillingAccount, BillingAccounts } from './ports/billing-accounts';
import type { BillingGateway, CheckoutSessionRequest } from './ports/billing-gateway';
import { StartCheckout } from './start-checkout';

const TENANT = '22222222-2222-4222-8222-222222222222';
const PRICES = { pro: 'price_pro_test', studio: 'price_studio_test' };
const URLS = { successUrl: 'http://web/ok', cancelUrl: 'http://web/no', returnUrl: 'http://web/b' };

function setup(account: Omit<BillingAccount, 'tenantId'>) {
  const calls: { checkout: CheckoutSessionRequest[]; portal: string[] } = {
    checkout: [],
    portal: [],
  };
  const accounts: BillingAccounts = {
    tenantIdForUser: async () => TENANT,
    find: async () => ({ tenantId: TENANT, ...account }),
  };
  const gateway: BillingGateway = {
    createCheckoutSession: async (request) => {
      calls.checkout.push(request);
      return { url: 'https://checkout.test' };
    },
    createPortalSession: async ({ customerId }) => {
      calls.portal.push(customerId);
      return { url: 'https://portal.test' };
    },
  };
  return { calls, useCase: new StartCheckout(accounts, gateway, PRICES) };
}

describe('StartCheckout', () => {
  it('opens Checkout for the chosen plan, reusing the studio customer', async () => {
    const { calls, useCase } = setup({
      plan: 'free',
      stripeCustomerId: 'cus_old',
      subscription: {
        status: 'canceled',
        priceId: PRICES.pro,
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
      },
    });

    expect(await useCase.execute(TENANT, 'studio', URLS)).toEqual({ url: 'https://checkout.test' });
    expect(calls.checkout).toEqual([
      expect.objectContaining({ tenantId: TENANT, priceId: PRICES.studio, customerId: 'cus_old' }),
    ]);
  });

  it('sends a studio that already pays to the portal instead of a second subscription', async () => {
    const { calls, useCase } = setup({
      plan: 'pro',
      stripeCustomerId: 'cus_paying',
      subscription: {
        status: 'active',
        priceId: PRICES.pro,
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
      },
    });

    expect(await useCase.execute(TENANT, 'studio', URLS)).toEqual({ url: 'https://portal.test' });
    expect(calls.checkout).toEqual([]);
    expect(calls.portal).toEqual(['cus_paying']);
  });
});
