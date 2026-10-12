import { describe, it } from 'vitest';

/**
 * Executable acceptance criteria for the Circuit Breaker. They come straight from the
 * architecture doc: table 3.3 (fallo y recuperación) and the success / failure sequence diagrams.
 * Turn each `it.todo` into a real test as you implement it (use the injectable `now` clock).
 */
describe('CircuitBreaker state machine (doc 3.3)', () => {
  it.todo('starts closed and passes calls through');
  it.todo('opens after 5 consecutive failures (CB_FAILURE_THRESHOLD)');
  it.todo('opens when 50% of the calls inside the window failed (CB_FAILURE_RATE, CB_WINDOW_MS)');
  it.todo('while open, answers immediately with the fallback and does NOT call the dependency');
  it.todo('without a fallback, an open circuit throws CircuitOpenError');
  it.todo('moves to half-open once CB_OPEN_TIMEOUT_MS elapsed');
  it.todo('half-open lets only CB_HALF_OPEN_MAX_CALLS probe calls through');
  it.todo('closes again and resumes normal traffic when the probes succeed');
  it.todo('goes back to open and restarts the timer when a probe fails');
  it.todo('counts a call slower than CB_CALL_TIMEOUT_MS as a failure');
  it.todo('notifies onStateChange on every transition');
});

describe('CircuitBreaker + FallbackCache (sequence diagrams)', () => {
  it.todo('success: stores the fresh response in the cache after a successful call');
  it.todo(
    'failure: after the retry fails and the threshold is exceeded, serves the cached response',
  );
  it.todo('failure: the cached answer is flagged as degraded so callers can tell');
});

describe('isolation', () => {
  it.todo('one breaker opening does not affect another (per dependency, and per tenant+provider)');
});

describe('FallbackCache', () => {
  it.todo(
    'MemoryFallbackCache returns what was set and evicts least recently used past maxEntries',
  );
  it.todo('MemoryFallbackCache ignores entries older than ttlMs');
  it.todo('FileFallbackCache persists entries across process restarts');
});
