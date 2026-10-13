import { billingModule } from '@/modules/billing/infrastructure/composition-root';
import { BILLING_PAGE, billingError, billingRequest, redirectTo } from '../billing-request';

/** Form post from the billing page: opens the Stripe customer portal. */
export async function POST(request: Request) {
  const context = await billingRequest(request);
  if (!('tenantId' in context)) return context;
  const { tenantId, origin } = context;

  try {
    const { url } = await billingModule().openPortal.execute(tenantId, `${origin}${BILLING_PAGE}`);
    return redirectTo(url);
  } catch (error) {
    return billingError('Open portal', origin, error);
  }
}
