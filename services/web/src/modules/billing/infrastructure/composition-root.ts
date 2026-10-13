import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/lib/db/schema';
import { GetBillingOverview } from '../application/get-billing-overview';
import { HandleStripeEvent } from '../application/handle-stripe-event';
import { OpenPortal } from '../application/open-portal';
import type { BillingAccounts } from '../application/ports/billing-accounts';
import type { StripeEventVerifier } from '../application/ports/stripe-event-verifier';
import { StartCheckout } from '../application/start-checkout';
import { DrizzleBillingStore } from './drizzle-billing-store';
import { StripeBillingGateway } from './stripe-billing-gateway';
import { StripeWebhookVerifier } from './stripe-webhook-verifier';

export interface BillingModule {
  verifier: StripeEventVerifier;
  handleStripeEvent: HandleStripeEvent;
  accounts: BillingAccounts;
  overview: GetBillingOverview;
  startCheckout: StartCheckout;
  openPortal: OpenPortal;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

let instance: BillingModule | undefined;

/**
 * Built on first use, not at import, so `next build` needs no Stripe secrets. A missing variable
 * or a non-test `STRIPE_SECRET_KEY` fails the request (the webhook answers 500 and Stripe
 * retries) instead of accepting unverified events or touching live mode.
 */
export function billingModule(): BillingModule {
  if (instance) return instance;
  const prices = { pro: required('STRIPE_PRICE_PRO'), studio: required('STRIPE_PRICE_STUDIO') };
  const verifier = new StripeWebhookVerifier(required('STRIPE_WEBHOOK_SECRET'));
  const gateway = new StripeBillingGateway(required('STRIPE_SECRET_KEY'));
  const db = drizzle(new Pool({ connectionString: required('WEB_DATABASE_URL'), max: 5 }), {
    schema,
  });
  const store = new DrizzleBillingStore(db);
  instance = {
    verifier,
    handleStripeEvent: new HandleStripeEvent(store, prices),
    accounts: store,
    overview: new GetBillingOverview(store),
    startCheckout: new StartCheckout(store, gateway, prices),
    openPortal: new OpenPortal(store, gateway),
  };
  return instance;
}
