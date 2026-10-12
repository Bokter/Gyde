import type { Plan } from '@gyde/contracts';

/**
 * Monthly price in USD shown on the landing and on /dashboard/billing. Stripe charges the price
 * behind STRIPE_PRICE_PRO / STRIPE_PRICE_STUDIO, so these numbers must match those prices.
 */
export const PLAN_MONTHLY_PRICE_USD: Record<Plan, number> = { free: 0, pro: 29, studio: 99 };

/**
 * Plan features the product really delivers. `compatibilityAnalysis` is in the plan catalog of
 * `@gyde/contracts` (and Pro and Studio include it), but the analyzer is not built yet: the pages
 * do not list it as a benefit until it is. Flip it when `CompatibilityAnalyzer` is implemented.
 */
export const DELIVERED_FEATURES = { compatibilityAnalysis: false } as const;
