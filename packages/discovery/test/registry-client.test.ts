import { describe, expect, it } from 'vitest';

import { NoHealthyInstanceError } from '../src';

describe('NoHealthyInstanceError', () => {
  it('names the service so callers can build a controlled error or degraded result', () => {
    const error = new NoHealthyInstanceError('reports');
    expect(error.serviceName).toBe('reports');
    expect(error.message).toContain('reports');
    expect(error).toBeInstanceOf(Error);
  });
});

/**
 * Executable acceptance criteria. They come from the architecture doc: flow 3.2 (steps I-VII) and
 * table 3.3 (fallo y recuperación). Turn each `it.todo` into a real test as you implement it.
 */
describe('registration (doc 3.1: Service Registry keeps the list of healthy instances)', () => {
  it.todo('registers the instance on start (POST /v1/instances)');
  it.todo('sends a heartbeat every HEARTBEAT_INTERVAL_MS');
  it.todo('deregisters the instance on graceful shutdown');
  it.todo('keeps trying to register if the registry is not reachable yet (retry with backoff)');
});

describe('resolve and pick (doc 3.2, steps II-III)', () => {
  it.todo('resolve returns only healthy instances');
  it.todo('pick balances round-robin across the healthy instances');
  it.todo('reuses resolve results for resolveCacheTtlMs instead of calling the registry each time');
  it.todo('pick throws NoHealthyInstanceError when no healthy instance exists (doc 3.3)');
});

describe('registry unavailable', () => {
  it.todo('falls back to the static URLs from the environment when the registry cannot be reached');
  it.todo('serves the last known instances for a short grace period');
});
