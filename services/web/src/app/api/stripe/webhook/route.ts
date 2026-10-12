import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { InvalidStripeSignatureError } from '@/modules/billing/domain/errors';
import { billingModule } from '@/modules/billing/infrastructure/composition-root';

const logger = createLogger('stripe-webhook');

/**
 * Stripe webhook (flow 5). Public, but only signed events get through. Status codes follow what
 * Stripe expects: 400 for a bad signature (not retried usefully), 200 once handled or ignored,
 * 500 on a failure or an event that matches no tenant yet, so Stripe retries. Logs carry the
 * event id and type only, never the body.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  let module;
  try {
    module = billingModule();
  } catch (error) {
    logger.error({ msg: 'Stripe webhook is not configured', errorName: (error as Error).name });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  let event;
  try {
    event = module.verifier.verify(rawBody, request.headers.get('stripe-signature'));
  } catch (error) {
    if (error instanceof InvalidStripeSignatureError) {
      logger.warn({ msg: 'Rejected a Stripe webhook with an invalid signature' });
      return NextResponse.json({ error: 'invalid-signature' }, { status: 400 });
    }
    logger.error({ msg: 'Stripe webhook verification failed', errorName: (error as Error).name });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  try {
    const result = await module.handleStripeEvent.execute(event);
    if (result.outcome === 'unmatched') {
      // Not marked processed: a 500 makes Stripe redeliver it once the tenant can be found.
      logger.warn({
        msg: 'Stripe event matched no tenant yet',
        eventId: event.eventId,
        type: event.type,
      });
      return NextResponse.json({ error: 'unmatched' }, { status: 500 });
    }
    logger.info({
      msg: 'Stripe event handled',
      eventId: event.eventId,
      type: event.type,
      ...result,
    });
    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error({
      msg: 'Stripe event failed',
      eventId: event.eventId,
      type: event.type,
      errorName: (error as Error).name,
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
