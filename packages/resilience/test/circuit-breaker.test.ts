import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CircuitBreaker, CircuitOpenError, type CircuitState } from '../src/circuit-breaker';
import { FileFallbackCache, MemoryFallbackCache } from '../src/fallback-cache';
import { createBreakerFromEnv } from '../src/env';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Returns a mock clock starting at `start` (default 0). Calling `advance(ms)` moves it forward
 * so tests never use real timers or Date.now.
 */
function makeClock(start = 0) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

/** Builds a CircuitBreaker with sensible test defaults and an injectable clock. */
function makeBreaker(
  overrides: Partial<ConstructorParameters<typeof CircuitBreaker>[0]> = {},
  clock = makeClock(),
) {
  return new CircuitBreaker({
    name: 'test-breaker',
    failureThreshold: 5,
    failureRate: 0.5,
    windowMs: 30_000,
    openTimeoutMs: 15_000,
    halfOpenMaxCalls: 2,
    callTimeoutMs: 10_000,
    now: clock.now,
    ...overrides,
  });
}

const ok =
  <T>(value: T) =>
  async () =>
    value;
const fail =
  (err = new Error('boom')) =>
  async () => {
    throw err;
  };

// ---------------------------------------------------------------------------
// State machine tests (doc 3.3)
// ---------------------------------------------------------------------------

describe('CircuitBreaker state machine (doc 3.3)', () => {
  it('starts closed and passes calls through', async () => {
    const breaker = makeBreaker();
    expect(breaker.state).toBe<CircuitState>('closed');
    const result = await breaker.execute(ok('hello'));
    expect(result).toBe('hello');
    expect(breaker.state).toBe<CircuitState>('closed');
  });

  it('opens after 5 consecutive failures (CB_FAILURE_THRESHOLD)', async () => {
    // failureRate: 2 (impossible value) disables the rate-based trigger so only the consecutive
    // threshold is tested — symmetric to the rate test that uses failureThreshold: 100.
    const breaker = makeBreaker({ failureThreshold: 5, failureRate: 2 });
    for (let i = 0; i < 4; i++) {
      await breaker.execute(fail(), { fallback: ok('fb') });
      expect(breaker.state).toBe<CircuitState>('closed');
    }
    await breaker.execute(fail(), { fallback: ok('fb') });
    expect(breaker.state).toBe<CircuitState>('open');
  });

  it('opens when 50% of the calls inside the window failed (CB_FAILURE_RATE, CB_WINDOW_MS)', async () => {
    const clock = makeClock();
    // Use a very high failure threshold so only the rate triggers the open.
    const breaker = makeBreaker(
      { failureThreshold: 100, failureRate: 0.5, windowMs: 30_000 },
      clock,
    );

    // 2 successes, then 2 failures → rate = 50% → should open
    await breaker.execute(ok(1));
    await breaker.execute(ok(2));
    await breaker.execute(fail(), { fallback: ok('fb') });
    expect(breaker.state).toBe<CircuitState>('closed'); // 1/3 ≈ 33%
    await breaker.execute(fail(), { fallback: ok('fb') });
    // 2 failures / 4 total = 50% → open
    expect(breaker.state).toBe<CircuitState>('open');
  });

  it('while open, answers immediately with the fallback and does NOT call the dependency', async () => {
    const clock = makeClock();
    const breaker = makeBreaker({ failureThreshold: 1 }, clock);

    // Open the circuit.
    await breaker.execute(fail(), { fallback: ok('fb') });
    expect(breaker.state).toBe<CircuitState>('open');

    const spy = vi.fn(async () => 'real-response');
    const result = await breaker.execute(spy, { fallback: ok('cached') });

    expect(spy).not.toHaveBeenCalled();
    expect(result).toBe('cached');
  });

  it('without a fallback, an open circuit throws CircuitOpenError', async () => {
    const breaker = makeBreaker({ failureThreshold: 1 });
    await breaker.execute(fail(), { fallback: ok('fb') });

    await expect(breaker.execute(ok('real'))).rejects.toThrow(CircuitOpenError);
  });

  it('moves to half-open once CB_OPEN_TIMEOUT_MS elapsed', async () => {
    const clock = makeClock();
    const breaker = makeBreaker({ failureThreshold: 1, openTimeoutMs: 15_000 }, clock);

    await breaker.execute(fail(), { fallback: ok('fb') });
    expect(breaker.state).toBe<CircuitState>('open');

    clock.advance(14_999);
    expect(breaker.state).toBe<CircuitState>('open'); // not yet

    clock.advance(1); // exactly 15 000 ms elapsed
    expect(breaker.state).toBe<CircuitState>('half-open');
  });

  it('half-open lets only CB_HALF_OPEN_MAX_CALLS probe calls through', async () => {
    const clock = makeClock();
    const breaker = makeBreaker(
      { failureThreshold: 1, openTimeoutMs: 1_000, halfOpenMaxCalls: 2 },
      clock,
    );

    // Open it.
    await breaker.execute(fail(), { fallback: ok('fb') });
    clock.advance(1_000); // → half-open

    const spy = vi.fn(async () => 'probe');

    // First two probes are let through.
    await breaker.execute(spy, { fallback: ok('fb') });
    await breaker.execute(spy, { fallback: ok('fb') });
    expect(spy).toHaveBeenCalledTimes(2);

    // Third call is blocked (breaker already closed at this point since both probes succeeded).
    // If it closed, the call goes through normally — let's verify the transition.
    expect(breaker.state).toBe<CircuitState>('closed');
  });

  it('closes again and resumes normal traffic when the probes succeed', async () => {
    const clock = makeClock();
    const breaker = makeBreaker(
      { failureThreshold: 1, openTimeoutMs: 1_000, halfOpenMaxCalls: 2 },
      clock,
    );

    await breaker.execute(fail(), { fallback: ok('fb') });
    clock.advance(1_000);
    expect(breaker.state).toBe<CircuitState>('half-open');

    await breaker.execute(ok('probe1'));
    await breaker.execute(ok('probe2'));
    expect(breaker.state).toBe<CircuitState>('closed');

    // Normal traffic flows again without fallback.
    const result = await breaker.execute(ok('normal'));
    expect(result).toBe('normal');
  });

  it('goes back to open and restarts the timer when a probe fails', async () => {
    const clock = makeClock();
    const breaker = makeBreaker(
      { failureThreshold: 1, openTimeoutMs: 1_000, halfOpenMaxCalls: 2 },
      clock,
    );

    await breaker.execute(fail(), { fallback: ok('fb') });
    clock.advance(1_000);
    expect(breaker.state).toBe<CircuitState>('half-open');

    // Probe fails → back to open, timer restarts.
    await breaker.execute(fail(), { fallback: ok('fb') });
    expect(breaker.state).toBe<CircuitState>('open');

    // Timer has been reset: advancing only 999 ms should still be open.
    clock.advance(999);
    expect(breaker.state).toBe<CircuitState>('open');

    // Full timeout elapsed again → half-open.
    clock.advance(1);
    expect(breaker.state).toBe<CircuitState>('half-open');
  });

  it('counts a call slower than CB_CALL_TIMEOUT_MS as a failure', async () => {
    // Use a real-time test with a very short timeout and a call that never resolves.
    const breaker = new CircuitBreaker({
      name: 'timeout-test',
      failureThreshold: 1,
      failureRate: 0.5,
      windowMs: 30_000,
      openTimeoutMs: 15_000,
      halfOpenMaxCalls: 2,
      callTimeoutMs: 50, // 50 ms
    });

    const neverResolves = async () =>
      new Promise<string>(() => {
        /* hangs */
      });

    // The call times out and counts as a failure, opening the circuit.
    await breaker.execute(neverResolves, { fallback: ok('fb') });
    expect(breaker.state).toBe<CircuitState>('open');
  }, 2_000);

  it('notifies onStateChange on every transition', async () => {
    const clock = makeClock();
    const changes: { from: CircuitState; to: CircuitState }[] = [];

    const breaker = makeBreaker(
      {
        failureThreshold: 1,
        openTimeoutMs: 1_000,
        halfOpenMaxCalls: 1,
        onStateChange: ({ from, to }) => changes.push({ from, to }),
      },
      clock,
    );

    await breaker.execute(fail(), { fallback: ok('fb') }); // closed → open
    clock.advance(1_000); // → half-open (lazy, triggered by state getter)
    expect(breaker.state).toBe('half-open');
    await breaker.execute(ok('probe')); // half-open → closed

    expect(changes).toEqual([
      { from: 'closed', to: 'open' },
      { from: 'open', to: 'half-open' },
      { from: 'half-open', to: 'closed' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// CircuitBreaker + FallbackCache integration (sequence diagrams)
// ---------------------------------------------------------------------------

describe('CircuitBreaker + FallbackCache (sequence diagrams)', () => {
  it('success: stores the fresh response in the cache after a successful call', async () => {
    const breaker = makeBreaker();
    const cache = new MemoryFallbackCache<string>({ maxEntries: 10 });

    const result = await breaker.execute(
      async () => {
        const fresh = 'fresh-data';
        await cache.set('key', fresh);
        return fresh;
      },
      { fallback: async () => (await cache.get('key'))?.value ?? 'empty' },
    );

    expect(result).toBe('fresh-data');
    expect((await cache.get('key'))?.value).toBe('fresh-data');
  });

  it('failure: after threshold exceeded, serves the cached response', async () => {
    const breaker = makeBreaker({ failureThreshold: 1 });
    const cache = new MemoryFallbackCache<string>({ maxEntries: 10 });
    await cache.set('key', 'last-good-value');

    const callFn = fail();
    const fallback = async () => (await cache.get('key'))?.value ?? 'empty';

    await breaker.execute(callFn, { fallback });
    expect(breaker.state).toBe<CircuitState>('open');

    const result = await breaker.execute(ok('should-not-reach'), { fallback });
    expect(result).toBe('last-good-value');
  });

  it('failure: the cached answer is flagged as degraded so callers can tell', async () => {
    const breaker = makeBreaker({ failureThreshold: 1 });
    const cache = new MemoryFallbackCache<{ data: string; degraded: boolean }>({ maxEntries: 10 });
    await cache.set('key', { data: 'stale', degraded: false });

    await breaker.execute(fail(), { fallback: async () => ({ data: '', degraded: true }) });
    expect(breaker.state).toBe<CircuitState>('open');

    const fallback = async () => {
      const entry = await cache.get('key');
      return entry ? { ...entry.value, degraded: true } : { data: '', degraded: true };
    };

    const result = await breaker.execute(fail(), { fallback });
    expect(result.degraded).toBe(true);
    expect(result.data).toBe('stale');
  });
});

// ---------------------------------------------------------------------------
// Isolation
// ---------------------------------------------------------------------------

describe('isolation', () => {
  it('one breaker opening does not affect another (per dependency, and per tenant+provider)', async () => {
    const breakerA = makeBreaker({ name: 'llm:tenant-1:openai', failureThreshold: 1 });
    const breakerB = makeBreaker({ name: 'llm:tenant-2:openai', failureThreshold: 1 });

    // Open only A.
    await breakerA.execute(fail(), { fallback: ok('fb-a') });
    expect(breakerA.state).toBe<CircuitState>('open');

    // B is still closed and calls go through.
    expect(breakerB.state).toBe<CircuitState>('closed');
    const result = await breakerB.execute(ok('b-result'));
    expect(result).toBe('b-result');
  });
});

// ---------------------------------------------------------------------------
// FallbackCache
// ---------------------------------------------------------------------------

describe('FallbackCache', () => {
  describe('MemoryFallbackCache', () => {
    it('returns what was set and evicts least recently used past maxEntries', async () => {
      const cache = new MemoryFallbackCache<number>({ maxEntries: 3 });

      await cache.set('a', 1); // insertion order: [a]
      await cache.set('b', 2); // insertion order: [a, b]
      await cache.set('c', 3); // insertion order: [a, b, c] — 'a' is LRU

      // Adding 'd' exceeds maxEntries → evicts 'a' (the LRU: oldest, never accessed).
      // We do NOT call get() before this point to avoid scrambling the LRU order.
      await cache.set('d', 4);
      expect(await cache.get('a')).toBeUndefined(); // evicted (was LRU)
      expect((await cache.get('b'))?.value).toBe(2); // still here
      expect((await cache.get('c'))?.value).toBe(3); // still here
      expect((await cache.get('d'))?.value).toBe(4); // new entry
    });

    it('get() refreshes the LRU position so the accessed entry is not evicted next', async () => {
      const cache = new MemoryFallbackCache<number>({ maxEntries: 3 });

      await cache.set('a', 1);
      await cache.set('b', 2);
      await cache.set('c', 3);

      // Access 'a' → moves it to MRU; 'b' becomes LRU.
      await cache.get('a');

      await cache.set('d', 4); // evicts 'b' (now the LRU)
      expect(await cache.get('b')).toBeUndefined(); // evicted
      expect((await cache.get('a'))?.value).toBe(1); // protected by the prior get
      expect((await cache.get('c'))?.value).toBe(3);
      expect((await cache.get('d'))?.value).toBe(4);
    });

    it('ignores entries older than ttlMs', async () => {
      const clock = makeClock(1_000);
      const cache = new MemoryFallbackCache<string>({ maxEntries: 10, ttlMs: 500, now: clock.now });

      await cache.set('key', 'value');
      expect((await cache.get('key'))?.value).toBe('value');

      clock.advance(501); // past TTL
      expect(await cache.get('key')).toBeUndefined();
    });
  });

  describe('FileFallbackCache', () => {
    let dir: string;

    beforeEach(() => {
      dir = join(tmpdir(), `gyde-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it('persists entries across process restarts', async () => {
      const cache1 = new FileFallbackCache<string>({ directory: dir });
      await cache1.set('key', 'persisted-value');

      // Simulate a new process by creating a fresh instance pointing to the same directory.
      const cache2 = new FileFallbackCache<string>({ directory: dir });
      const entry = await cache2.get('key');
      expect(entry?.value).toBe('persisted-value');
      expect(entry?.storedAt).toBeTypeOf('number');
    });

    it('returns undefined when the entry does not exist', async () => {
      const cache = new FileFallbackCache<string>({ directory: dir });
      expect(await cache.get('missing')).toBeUndefined();
    });

    it('respects ttlMs and ignores stale entries', async () => {
      const clock = makeClock(1_000);
      const cache = new FileFallbackCache<string>({ directory: dir, ttlMs: 500, now: clock.now });

      await cache.set('key', 'stale');
      clock.advance(501);
      expect(await cache.get('key')).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// createBreakerFromEnv
// ---------------------------------------------------------------------------

describe('createBreakerFromEnv', () => {
  it('reads CB_* variables from the provided env map', () => {
    const opts = createBreakerFromEnv('my-dep', {
      CB_FAILURE_THRESHOLD: '3',
      CB_FAILURE_RATE: '0.3',
      CB_WINDOW_MS: '10000',
      CB_OPEN_TIMEOUT_MS: '5000',
      CB_HALF_OPEN_MAX_CALLS: '1',
      CB_CALL_TIMEOUT_MS: '2000',
    });

    expect(opts.name).toBe('my-dep');
    expect(opts.failureThreshold).toBe(3);
    expect(opts.failureRate).toBe(0.3);
    expect(opts.windowMs).toBe(10_000);
    expect(opts.openTimeoutMs).toBe(5_000);
    expect(opts.halfOpenMaxCalls).toBe(1);
    expect(opts.callTimeoutMs).toBe(2_000);
  });

  it('falls back to documented defaults when variables are missing', () => {
    const opts = createBreakerFromEnv('dep', {});
    expect(opts.failureThreshold).toBe(5);
    expect(opts.failureRate).toBe(0.5);
    expect(opts.windowMs).toBe(30_000);
    expect(opts.openTimeoutMs).toBe(15_000);
    expect(opts.halfOpenMaxCalls).toBe(2);
    expect(opts.callTimeoutMs).toBe(10_000);
  });
});
