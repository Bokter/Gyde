import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  checkouts: [] as unknown[],
}));

vi.mock('@/modules/auth/infrastructure/auth.config', () => ({ auth: async () => state.session }));
vi.mock('@/modules/billing/infrastructure/composition-root', () => ({
  billingModule: () => ({
    accounts: { tenantIdForUser: async () => '22222222-2222-4222-8222-222222222222' },
    startCheckout: {
      execute: async (...args: unknown[]) => {
        state.checkouts.push(args);
        return { url: 'https://checkout.test/cs' };
      },
    },
  }),
}));

const { POST } = await import('./route');

function post(origin: string | null) {
  return POST(
    new Request('http://localhost:3000/api/billing/checkout', {
      method: 'POST',
      body: new URLSearchParams({ plan: 'pro' }),
      headers: origin ? { origin } : {},
    }),
  );
}

describe('POST /api/billing/checkout', () => {
  beforeEach(() => {
    state.session = { user: { id: 'user-1' } };
    state.checkouts.length = 0;
  });

  it('rejects a cross-site form post even with a valid session', async () => {
    for (const origin of ['https://evil.example', null]) {
      expect((await post(origin)).status).toBe(403);
    }
    expect(state.checkouts).toEqual([]);
  });

  it('sends a visitor without a session to the login page', async () => {
    state.session = null;
    const response = await post('http://localhost:3000');
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://localhost:3000/auth/login');
    expect(state.checkouts).toEqual([]);
  });

  it('redirects the studio to Stripe Checkout', async () => {
    const response = await post('http://localhost:3000');
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://checkout.test/cs');
  });
});
