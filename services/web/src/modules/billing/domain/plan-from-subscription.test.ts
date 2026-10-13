import { describe, expect, it } from 'vitest';
import { planForSubscription } from './plan-from-subscription';

const PRICES = { pro: 'price_pro', studio: 'price_studio' };

describe('planForSubscription', () => {
  it('grants the paid plan only for a known price in a paying status', () => {
    expect(planForSubscription('active', 'price_pro', PRICES)).toBe('pro');
    expect(planForSubscription('trialing', 'price_studio', PRICES)).toBe('studio');
    expect(planForSubscription('past_due', 'price_pro', PRICES)).toBe('pro');

    for (const status of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused']) {
      expect(planForSubscription(status, 'price_pro', PRICES)).toBe('free');
    }
    expect(planForSubscription('active', 'price_unknown', PRICES)).toBe('free');
    expect(planForSubscription('active', null, PRICES)).toBe('free');
  });
});
