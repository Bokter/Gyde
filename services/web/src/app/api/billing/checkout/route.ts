import type { PaidPlan } from '@/modules/billing/domain/plan-from-subscription';
import { billingModule } from '@/modules/billing/infrastructure/composition-root';
import { BILLING_PAGE, billingError, billingRequest, redirectTo } from '../billing-request';

const isPaidPlan = (value: unknown): value is PaidPlan => value === 'pro' || value === 'studio';

/** Form post from the billing page: sends the studio to Stripe Checkout for `plan`. */
export async function POST(request: Request) {
  const context = await billingRequest(request);
  if (!('tenantId' in context)) return context;
  const { tenantId, origin } = context;

  const plan = (await request.formData().catch(() => null))?.get('plan');
  if (!isPaidPlan(plan)) {
    return redirectTo(new URL(`${BILLING_PAGE}?error=invalid-plan`, origin));
  }

  try {
    const { url } = await billingModule().startCheckout.execute(tenantId, plan, {
      successUrl: `${origin}${BILLING_PAGE}?checkout=success`,
      cancelUrl: `${origin}${BILLING_PAGE}?checkout=cancelled`,
      returnUrl: `${origin}${BILLING_PAGE}`,
    });
    return redirectTo(url);
  } catch (error) {
    return billingError('Start checkout', origin, error);
  }
}
