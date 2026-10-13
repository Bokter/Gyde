import { NoStripeCustomerError } from '../domain/errors';
import type { BillingAccounts } from './ports/billing-accounts';
import type { BillingGateway } from './ports/billing-gateway';

/** Opens the Stripe customer portal: payment method, invoices, plan change and cancellation. */
export class OpenPortal {
  constructor(
    private readonly accounts: BillingAccounts,
    private readonly gateway: BillingGateway,
  ) {}

  async execute(tenantId: string, returnUrl: string): Promise<{ url: string }> {
    const customerId = (await this.accounts.find(tenantId))?.stripeCustomerId;
    if (!customerId) throw new NoStripeCustomerError();
    return this.gateway.createPortalSession({ customerId, returnUrl });
  }
}
