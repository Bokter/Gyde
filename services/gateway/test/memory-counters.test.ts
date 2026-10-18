import { describe, expect, it } from 'vitest';

import { MemoryRateLimiter } from '../src/infrastructure/memory-rate-limiter';
import { MemoryUsageCounter } from '../src/infrastructure/memory-usage-counter';

describe('MemoryRateLimiter', () => {
  it('keeps one window per key and opens a new one after the window length', () => {
    let now = 0;
    const limiter = new MemoryRateLimiter({ limit: 1, now: () => now });
    expect(limiter.consume('a').allowed).toBe(true);
    expect(limiter.consume('a')).toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect(limiter.consume('b').allowed).toBe(true);
    now = 60_000;
    expect(limiter.consume('a').allowed).toBe(true);
  });

  it('forgets expired windows first and the oldest one when it is full', () => {
    let now = 0;
    const limiter = new MemoryRateLimiter({ limit: 1, maxKeys: 2, now: () => now });
    limiter.consume('a');
    now = 10_000;
    limiter.consume('b');
    // Full, nothing expired: the oldest (a) is dropped, so a starts over.
    limiter.consume('c');
    expect(limiter.consume('b').allowed).toBe(false);
    expect(limiter.consume('a').allowed).toBe(true);
  });
});

describe('MemoryUsageCounter', () => {
  it('reserves per tenant, releases, and starts again in a new period', () => {
    const counter = new MemoryUsageCounter();
    expect(counter.reserve('t1', '2026-10', 1)).toBe(true);
    expect(counter.reserve('t1', '2026-10', 1)).toBe(false);
    expect(counter.reserve('t2', '2026-10', 1)).toBe(true);
    counter.release('t1', '2026-10');
    expect(counter.reserve('t1', '2026-10', 1)).toBe(true);
    expect(counter.reserve('t1', '2026-11', 1)).toBe(true);
  });

  it('ignores a release for another period and never counts below zero', () => {
    const counter = new MemoryUsageCounter();
    counter.reserve('t1', '2026-10', 1);
    counter.release('t1', '2026-09');
    expect(counter.reserve('t1', '2026-10', 1)).toBe(false);
    counter.release('t1', '2026-10');
    counter.release('t1', '2026-10');
    expect(counter.reserve('t1', '2026-10', 1)).toBe(true);
    expect(counter.reserve('t1', '2026-10', 1)).toBe(false);
  });

  it('does not limit a null allowance', () => {
    const counter = new MemoryUsageCounter();
    for (let i = 0; i < 100; i += 1) expect(counter.reserve('t1', '2026-10', null)).toBe(true);
  });
});
