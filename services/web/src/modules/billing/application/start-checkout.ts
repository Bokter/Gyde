import {
  planForSubscription,
  type PaidPlan,
  type PlanPrices,
} from '../domain/plan-from-subscription';
import { NoStripeCustomerError } from '../domain/errors';
import type { BillingAccounts } from './ports/billing-accounts';
import type { BillingGateway } from './ports/billing-gateway';

export interface CheckoutUrls {
  successUrl: string;
  cancelUrl: string;
  /** Where the portal returns, when the studio already pays and is sent there instead. */
  returnUrl: string;
}

/**
 * Starts Stripe Checkout for a paid plan. It grants nothing: the plan changes only when the
 * webhook applies the subscription (flow 5). A studio that already pays is sent to the portal,
 * where it changes or cancels its plan, so it never ends up with two subscriptions.
 */
export class StartCheckout {
  constructor(
    private readonly accounts: BillingAccounts,
    private readonly gateway: BillingGateway,
    private readonly prices: PlanPrices,
  ) {}

  async execute(tenantId: string, plan: PaidPlan, urls: CheckoutUrls): Promise<{ url: string }> {
    const account = await this.accounts.find(tenantId);
    if (!account) throw new Error('Tenant not found');

    const subscription = account.subscription;
    const paying =
      subscription !== null &&
      planForSubscription(subscription.status, subscription.priceId, this.prices) !== 'free';
    if (paying) {
      if (!account.stripeCustomerId) throw new NoStripeCustomerError();
      return this.gateway.createPortalSession({
        customerId: account.stripeCustomerId,
        returnUrl: urls.returnUrl,
      });
    }

    return this.gateway.createCheckoutSession({
      tenantId,
      priceId: this.prices[plan],
      customerId: account.stripeCustomerId,
      successUrl: urls.successUrl,
      cancelUrl: urls.cancelUrl,
    });
  }
}
