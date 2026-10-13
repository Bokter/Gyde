import { PLAN_CATALOG, type Entitlements } from '@gyde/contracts';
import type { BillingAccount, BillingAccounts } from './ports/billing-accounts';

export interface BillingOverview {
  entitlements: Entitlements;
  /** The studio has a Stripe customer, so the portal can be opened. */
  canOpenPortal: boolean;
  subscription: BillingAccount['subscription'];
}

/** What the billing screen shows. The plan is the one the webhook stored, never a guess. */
export class GetBillingOverview {
  constructor(private readonly accounts: BillingAccounts) {}

  async execute(tenantId: string): Promise<BillingOverview | null> {
    const account = await this.accounts.find(tenantId);
    if (!account) return null;
    return {
      entitlements: PLAN_CATALOG[account.plan],
      canOpenPortal: account.stripeCustomerId !== null,
      subscription: account.subscription,
    };
  }
}
