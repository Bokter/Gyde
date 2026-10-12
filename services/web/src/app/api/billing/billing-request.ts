import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { auth } from '@/modules/auth/infrastructure/auth.config';
import { NoStripeCustomerError } from '@/modules/billing/domain/errors';
import { billingModule } from '@/modules/billing/infrastructure/composition-root';

const logger = createLogger('billing');

export const BILLING_PAGE = '/dashboard/billing';

/** 303 so the browser follows a form POST with a GET. */
export const redirectTo = (url: string | URL) => NextResponse.redirect(url, 303);

/**
 * Shared steps of the billing form posts: same-origin check (the session cookie is `SameSite=Lax`,
 * this rejects any cross-site POST that still carries it), signed-in user and their tenant.
 * Returns the response to send when the request cannot go on.
 */
export async function billingRequest(
  request: Request,
): Promise<{ tenantId: string; origin: string } | NextResponse> {
  const origin = new URL(request.url).origin;
  if (request.headers.get('origin') !== origin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const session = await auth();
  if (!session?.user?.id) return redirectTo(new URL('/auth/login', origin));

  const tenantId = await billingModule().accounts.tenantIdForUser(session.user.id);
  if (!tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return { tenantId, origin };
}

/** Back to the billing page with an error code; Stripe and SDK messages never reach the user. */
export function billingError(operation: string, origin: string, error: unknown) {
  const code = error instanceof NoStripeCustomerError ? 'no-customer' : 'stripe-unavailable';
  if (code === 'stripe-unavailable') {
    logger.error({ msg: `${operation} failed`, errorName: (error as Error)?.name ?? 'unknown' });
  }
  return redirectTo(new URL(`${BILLING_PAGE}?error=${code}`, origin));
}
