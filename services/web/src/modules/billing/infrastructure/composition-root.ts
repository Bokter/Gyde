import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/lib/db/schema';
import { HandleStripeEvent } from '../application/handle-stripe-event';
import type { StripeEventVerifier } from '../application/ports/stripe-event-verifier';
import { DrizzleBillingStore } from './drizzle-billing-store';
import { StripeWebhookVerifier } from './stripe-webhook-verifier';

export interface BillingModule {
  verifier: StripeEventVerifier;
  handleStripeEvent: HandleStripeEvent;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

let instance: BillingModule | undefined;

/**
 * Built on first use, not at import, so `next build` needs no Stripe secrets. A missing variable
 * fails the webhook request (500, Stripe retries) instead of accepting unverified events.
 */
export function billingModule(): BillingModule {
  if (instance) return instance;
  const prices = { pro: required('STRIPE_PRICE_PRO'), studio: required('STRIPE_PRICE_STUDIO') };
  const verifier = new StripeWebhookVerifier(required('STRIPE_WEBHOOK_SECRET'));
  const db = drizzle(new Pool({ connectionString: required('WEB_DATABASE_URL'), max: 5 }), {
    schema,
  });
  instance = {
    verifier,
    handleStripeEvent: new HandleStripeEvent(new DrizzleBillingStore(db), prices),
  };
  return instance;
}
