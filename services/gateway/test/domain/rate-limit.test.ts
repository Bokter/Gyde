import { describe, expect, it } from 'vitest';

import { RateLimitWindow } from '../../src/domain/rate-limit';

const WINDOW_MS = 60_000;

describe('RateLimitWindow', () => {
  it('allows up to the limit and then refuses until the window closes', () => {
    const window = RateLimitWindow.open(1_000);
    expect(window.consume(1_000, 2, WINDOW_MS)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(window.consume(1_000, 2, WINDOW_MS)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(window.consume(1_000, 2, WINDOW_MS)).toEqual({ allowed: false, retryAfterSeconds: 60 });
  });

  it('counts a refused request as nothing: it does not extend the wait', () => {
    const window = RateLimitWindow.open(0);
    window.consume(0, 1, WINDOW_MS);
    expect(window.consume(20_000, 1, WINDOW_MS).retryAfterSeconds).toBe(40);
    expect(window.consume(20_000, 1, WINDOW_MS).retryAfterSeconds).toBe(40);
  });

  it('rounds the wait up to whole seconds and never answers less than one second', () => {
    const window = RateLimitWindow.open(0);
    window.consume(0, 1, WINDOW_MS);
    expect(window.consume(20_001, 1, WINDOW_MS).retryAfterSeconds).toBe(40);
    expect(window.consume(59_001, 1, WINDOW_MS).retryAfterSeconds).toBe(1);
    expect(window.consume(59_999, 1, WINDOW_MS).retryAfterSeconds).toBe(1);
  });

  it('expires exactly when the window length has passed', () => {
    const window = RateLimitWindow.open(1_000);
    expect(window.hasExpired(60_999, WINDOW_MS)).toBe(false);
    expect(window.hasExpired(61_000, WINDOW_MS)).toBe(true);
  });
});
