import type { Plan } from '@gyde/contracts';
import Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LoggerModule from '@/lib/logger';
import type { SubscriptionSnapshot } from '@/modules/billing/application/billing-event';
import type {
  ApplySubscriptionResult,
  BillingStore,
  EventClaim,
} from '@/modules/billing/application/ports/billing-store';
import { isStaleEvent } from '@/modules/billing/domain/event-order';
import { HandleStripeEvent } from '@/modules/billing/application/handle-stripe-event';
import { StripeWebhookVerifier } from '@/modules/billing/infrastructure/stripe-webhook-verifier';

const SECRET = 'whsec_test_secret_for_unit_tests';
const PRICES = { pro: 'price_pro_test', studio: 'price_studio_test' };
const TENANT = '22222222-2222-4222-8222-222222222222';

class InMemoryBillingStore implements BillingStore {
  readonly events = new Map<string, boolean>();
  readonly tenants = new Map<string, { plan: Plan; customerId: string | null }>([
    [TENANT, { plan: 'free', customerId: null }],
  ]);
  readonly lastEvent = new Map<string, { occurredAt: Date; status: string }>();
  applied = 0;
  failNextApply = false;

  async claimEvent({ stripeEventId }: { stripeEventId: string }): Promise<EventClaim> {
    const processed = this.events.get(stripeEventId);
    if (processed === undefined) {
      this.events.set(stripeEventId, false);
      return 'new';
    }
    return processed ? 'processed' : 'retry';
  }
  async markEventProcessed(stripeEventId: string) {
    this.events.set(stripeEventId, true);
  }
  async linkCustomer(tenantId: string, customerId: string) {
    const tenant = this.tenants.get(tenantId);
    if (tenant) tenant.customerId = customerId;
    return !!tenant;
  }
  async findTenantIdByCustomer(customerId: string) {
    return [...this.tenants].find(([, t]) => t.customerId === customerId)?.[0] ?? null;
  }
  async applySubscription(
    tenantId: string,
    subscription: SubscriptionSnapshot,
    plan: Plan,
    occurredAt: Date,
  ): Promise<ApplySubscriptionResult> {
    if (this.failNextApply) {
      this.failNextApply = false;
      throw new Error('database unavailable');
    }
    const last = this.lastEvent.get(subscription.subscriptionId) ?? null;
    if (isStaleEvent(last, { occurredAt, status: subscription.status })) return 'stale';
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return 'tenant-not-found';
    this.applied += 1;
    this.lastEvent.set(subscription.subscriptionId, { occurredAt, status: subscription.status });
    Object.assign(tenant, { plan, customerId: subscription.customerId });
    return 'applied';
  }
}

const state = vi.hoisted(() => {
  const lines: string[] = [];
  return {
    store: undefined as unknown as InMemoryBillingStore,
    lines,
    destination: { write: (line: string) => void lines.push(line) },
  };
});

vi.mock('@/modules/billing/infrastructure/composition-root', () => ({
  billingModule: () => ({
    verifier: new StripeWebhookVerifier(SECRET),
    handleStripeEvent: new HandleStripeEvent(state.store, PRICES),
  }),
}));
vi.mock('@/lib/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof LoggerModule>();
  return {
    ...actual,
    createLogger: (name: string) => actual.createLogger(name, state.destination),
  };
});

const { POST } = await import('./route');

const now = Math.floor(Date.now() / 1000);

function stripeEvent(id: string, type: string, object: Record<string, unknown>, created = now) {
  return { id, object: 'event', type, livemode: false, created, data: { object } };
}

function subscription(status: string, price: string) {
  return {
    id: 'sub_test_1',
    object: 'subscription',
    customer: 'cus_test_1',
    status,
    // Current API shape (basil and later): the billing period lives on each item.
    items: {
      object: 'list',
      data: [
        { price: { id: price }, current_period_start: now, current_period_end: now + 30 * 86400 },
      ],
    },
    cancel_at_period_end: false,
    canceled_at: status === 'canceled' ? now : null,
    metadata: {},
  };
}

function deliver(event: object, signature?: string) {
  const payload = JSON.stringify(event);
  const header = signature ?? Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return POST(
    new Request('http://web/api/stripe/webhook', {
      method: 'POST',
      body: payload,
      headers: { 'stripe-signature': header, 'content-type': 'application/json' },
    }),
  );
}

describe('POST /api/stripe/webhook', () => {
  beforeEach(() => {
    state.store = new InMemoryBillingStore();
    state.lines.length = 0;
  });

  it('rejects unsigned, wrongly signed or tampered bodies and changes nothing', async () => {
    const event = stripeEvent('evt_forged', 'customer.subscription.updated', {
      ...subscription('active', PRICES.studio),
      metadata: { tenantId: TENANT },
    });
    const payload = JSON.stringify(event);
    const signedForOtherBody = Stripe.webhooks.generateTestHeaderString({
      payload: payload.replace('studio', 'pro'),
      secret: SECRET,
    });
    const signedWithOtherSecret = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: 'whsec_attacker',
    });

    for (const signature of ['', signedForOtherBody, signedWithOtherSecret]) {
      const response = await deliver(event, signature);
      expect(response.status).toBe(400);
    }
    expect(state.store.events.size).toBe(0);
    expect(state.store.tenants.get(TENANT)!.plan).toBe('free');
  });

  it('upgrades the studio only through the webhook and returns it to free when cancelled', async () => {
    const checkout = stripeEvent('evt_checkout', 'checkout.session.completed', {
      id: 'cs_test_1',
      object: 'checkout.session',
      client_reference_id: TENANT,
      customer: 'cus_test_1',
      customer_details: { email: 'studio-owner@example.com' },
      subscription: 'sub_test_1',
    });
    expect((await deliver(checkout)).status).toBe(200);
    // Coming back from Checkout links the customer, but grants nothing by itself.
    expect(state.store.tenants.get(TENANT)).toEqual({ plan: 'free', customerId: 'cus_test_1' });

    // No tenant metadata: the tenant is found through the customer linked above.
    await deliver(
      stripeEvent(
        'evt_active',
        'customer.subscription.updated',
        subscription('active', PRICES.pro),
      ),
    );
    expect(state.store.tenants.get(TENANT)!.plan).toBe('pro');

    await deliver(
      stripeEvent(
        'evt_deleted',
        'customer.subscription.deleted',
        subscription('canceled', PRICES.pro),
      ),
    );
    expect(state.store.tenants.get(TENANT)!.plan).toBe('free');

    const logs = state.lines.join('');
    expect(logs).toContain('evt_active');
    expect(logs).not.toContain('studio-owner@example.com');
  });

  it('applies a redelivered event once, and retries one whose processing failed', async () => {
    const event = stripeEvent('evt_once', 'customer.subscription.updated', {
      ...subscription('active', PRICES.studio),
      metadata: { tenantId: TENANT },
    });

    state.store.failNextApply = true;
    expect((await deliver(event)).status).toBe(500);
    expect(state.store.tenants.get(TENANT)!.plan).toBe('free');

    expect((await deliver(event)).status).toBe(200);
    expect((await deliver(event)).status).toBe(200);
    expect(state.store.applied).toBe(1);
    expect(state.store.tenants.get(TENANT)!.plan).toBe('studio');
  });

  it('answers 500 for a subscription that matches no tenant yet, and applies it on redelivery', async () => {
    // Delivered before `checkout.session.completed` and without tenant metadata.
    const early = stripeEvent(
      'evt_early',
      'customer.subscription.created',
      subscription('active', PRICES.pro),
    );
    expect((await deliver(early)).status).toBe(500);
    expect(state.store.events.get('evt_early')).toBe(false);

    const checkout = stripeEvent('evt_checkout', 'checkout.session.completed', {
      id: 'cs_test_1',
      object: 'checkout.session',
      client_reference_id: TENANT,
      customer: 'cus_test_1',
    });
    expect((await deliver(checkout)).status).toBe(200);

    // Stripe's retry now finds the tenant through the linked customer.
    expect((await deliver(early)).status).toBe(200);
    expect(state.store.events.get('evt_early')).toBe(true);
    expect(state.store.tenants.get(TENANT)!.plan).toBe('pro');
  });

  it('ignores a subscription event older than the last one applied', async () => {
    const withTenant = (status: string, price: string) => ({
      ...subscription(status, price),
      metadata: { tenantId: TENANT },
    });
    const newer = stripeEvent(
      'evt_newer',
      'customer.subscription.updated',
      withTenant('active', PRICES.studio),
      now,
    );
    const older = stripeEvent(
      'evt_older',
      'customer.subscription.updated',
      withTenant('active', PRICES.pro),
      now - 60,
    );

    // Same second as `newer`: the `created` that Stripe redelivers after the activation.
    const sameSecondCreated = stripeEvent(
      'evt_created',
      'customer.subscription.created',
      withTenant('incomplete', PRICES.studio),
      now,
    );

    expect((await deliver(newer)).status).toBe(200);
    expect((await deliver(older)).status).toBe(200);
    expect((await deliver(sameSecondCreated)).status).toBe(200);
    expect(state.store.tenants.get(TENANT)!.plan).toBe('studio');
    expect(state.store.events.get('evt_older')).toBe(true);
  });
});
