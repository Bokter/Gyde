import { describe, expect, it } from 'vitest';

import { TenantUsage, billingPeriodOf } from '../../src/domain/usage-allowance';

describe('billingPeriodOf', () => {
  it('is the calendar month in UTC', () => {
    expect(billingPeriodOf(Date.parse('2026-10-31T23:59:59Z'))).toBe('2026-10');
    expect(billingPeriodOf(Date.parse('2026-11-01T00:00:00Z'))).toBe('2026-11');
    expect(billingPeriodOf(Date.parse('2027-01-15T12:00:00Z'))).toBe('2027-01');
  });
});

describe('TenantUsage', () => {
  it('takes analyses until the allowance is used up, then counts nothing more', () => {
    const usage = TenantUsage.start('2026-10');
    expect(usage.reserve(2)).toBe(true);
    expect(usage.reserve(2)).toBe(true);
    expect(usage.reserve(2)).toBe(false);
    expect(usage.reserve(2)).toBe(false);
    usage.release();
    expect(usage.reserve(2)).toBe(true);
    expect(usage.reserve(2)).toBe(false);
  });

  it('never limits a null allowance', () => {
    const usage = TenantUsage.start('2026-10');
    for (let i = 0; i < 1000; i += 1) expect(usage.reserve(null)).toBe(true);
  });

  it('does not give back more than it took', () => {
    const usage = TenantUsage.start('2026-10');
    usage.release();
    usage.release();
    expect(usage.reserve(1)).toBe(true);
    expect(usage.reserve(1)).toBe(false);
  });

  it('remembers its period', () => {
    expect(TenantUsage.start('2026-10').period).toBe('2026-10');
  });
});
