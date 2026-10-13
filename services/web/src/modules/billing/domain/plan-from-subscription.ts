import type { Plan } from '@gyde/contracts';

export type PaidPlan = Exclude<Plan, 'free'>;

/** Stripe price ids of the paid plans (`STRIPE_PRICE_PRO`, `STRIPE_PRICE_STUDIO`). */
export interface PlanPrices {
  pro: string;
  studio: string;
}

/**
 * Statuses that keep the paid plan. `past_due` keeps it while Stripe retries the charge: if the
 * retries fail, Stripe moves the subscription to `unpaid` or `canceled` and the studio drops to
 * `free` with that event.
 */
const PAID_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing', 'past_due']);

export function planForPrice(priceId: string | null, prices: PlanPrices): PaidPlan | null {
  if (!priceId) return null;
  if (priceId === prices.pro) return 'pro';
  if (priceId === prices.studio) return 'studio';
  return null;
}

/** The plan a subscription grants: an unknown price or an inactive status means `free`. */
export function planForSubscription(
  status: string,
  priceId: string | null,
  prices: PlanPrices,
): Plan {
  const paid = planForPrice(priceId, prices);
  return paid && PAID_STATUSES.has(status) ? paid : 'free';
}
