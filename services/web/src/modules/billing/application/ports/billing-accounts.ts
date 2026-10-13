import type { Plan } from '@gyde/contracts';

/** What the billing screen and the Checkout/Portal use cases need to know about a studio. */
export interface BillingAccount {
  tenantId: string;
  plan: Plan;
  stripeCustomerId: string | null;
  /** Latest subscription the webhook applied, or `null` if the studio never subscribed. */
  subscription: {
    status: string;
    priceId: string | null;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
  } | null;
}

export interface BillingAccounts {
  /** Tenant owned by the signed-in user, or `null`. */
  tenantIdForUser(userId: string): Promise<string | null>;
  find(tenantId: string): Promise<BillingAccount | null>;
}
