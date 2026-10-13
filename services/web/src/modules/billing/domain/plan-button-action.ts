import type { Plan } from '@gyde/contracts';

/** What a plan button on the landing does for the person looking at it. */
export type PlanButtonAction = 'login' | 'dashboard' | 'checkout' | 'portal';

/**
 * `currentPlan` is null without a session. A studio that already pays never gets `checkout`: it
 * changes or cancels its plan in the Stripe portal, so it never ends up with two subscriptions
 * (`StartCheckout` enforces the same rule on the server).
 */
export function planButtonAction(currentPlan: Plan | null, target: Plan): PlanButtonAction {
  if (currentPlan === null) return 'login';
  if (currentPlan === target) return 'dashboard';
  return currentPlan === 'free' ? 'checkout' : 'portal';
}
