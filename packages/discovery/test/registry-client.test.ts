import type { InstanceInfo, ServiceRegistration } from '@gyde/contracts';
import { describe, expect, it, vi } from 'vitest';

import { NoHealthyInstanceError, RegistryClient, startRegistration } from '../src';

const sampleRegistration: ServiceRegistration = {
  serviceName: 'reports',
  instanceId: 'reports-1',
  baseUrl: 'http://localhost:4500',
  version: '1.0.0',
  metadata: {},
};

const sampleInstance: InstanceInfo = {
  instanceId: 'reports-1',
  serviceName: 'reports',
  baseUrl: 'http://localhost:4500',
  version: '1.0.0',
  healthy: true,
  registeredAt: new Date().toISOString(),
  lastHeartbeatAt: new Date().toISOString(),
};

describe('NoHealthyInstanceError', () => {
  it('names the service so callers can build a controlled error or degraded result', () => {
    const error = new NoHealthyInstanceError('reports');
    expect(error.serviceName).toBe('reports');
    expect(error.message).toContain('reports');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('registration (doc 3.1: Service Registry keeps the list of healthy instances)', () => {
  it('registers the instance on start (POST /v1/instances)', async () => {
    const calls: { url: string; method?: string }[] = [];
    const mockFetch: typeof fetch = (async (url, init) => {
      calls.push({ url: url.toString(), method: init?.method });
      return new Response(null, { status: 201 });
    }) as typeof fetch;

    const client = new RegistryClient({
      registryUrl: 'http://registry:4100',
      internalToken: 'test-token',
      fetch: mockFetch,
    });

    await client.register(sampleRegistration);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('http://registry:4100/v1/instances');
    expect(calls[0]?.method).toBe('POST');
  });

  it('sends a heartbeat every HEARTBEAT_INTERVAL_MS', async () => {
    vi.useFakeTimers();
    const calls: { url: string; method?: string }[] = [];
    const mockFetch: typeof fetch = (async (url, init) => {
      calls.push({ url: url.toString(), method: init?.method });
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const client = new RegistryClient({
      registryUrl: 'http://registry:4100',
      internalToken: 'test-token',
      fetch: mockFetch,
    });

    const active = await startRegistration({
      client,
      registration: sampleRegistration,
      heartbeatIntervalMs: 5000,
    });

    // 1 register call on start
    expect(calls).toHaveLength(1);

    // Advance 5s -> 1 heartbeat call
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[1]?.url).toBe('http://registry:4100/v1/instances/reports-1/heartbeat');

    await active.stop();
    vi.useRealTimers();
  });

  it('deregisters the instance on graceful shutdown', async () => {
    const calls: { url: string; method?: string }[] = [];
    const mockFetch: typeof fetch = (async (url, init) => {
      calls.push({ url: url.toString(), method: init?.method });
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const client = new RegistryClient({
      registryUrl: 'http://registry:4100',
      internalToken: 'test-token',
      fetch: mockFetch,
    });

    await client.deregister('reports-1');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('http://registry:4100/v1/instances/reports-1');
    expect(calls[0]?.method).toBe('DELETE');
  });

  it('keeps trying to register if the registry is not reachable yet (retry with backoff)', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const mockFetch: typeof fetch = (async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Network error');
      }
      return new Response(null, { status: 201 });
    }) as typeof fetch;

    const client = new RegistryClient({
      registryUrl: 'http://registry:4100',
      internalToken: 'test-token',
      fetch: mockFetch,
    });

    const regPromise = startRegistration({
      client,
      registration: sampleRegistration,
      heartbeatIntervalMs: 5000,
    });

    // Advance timer to allow retries
    await vi.advanceTimersByTimeAsync(3000);
    const active = await regPromise;

    expect(attempts).toBe(3);
    await active.stop();
    vi.useRealTimers();
  });
});

describe('resolve and pick (doc 3.2, steps II-III)', () => {
  it('resolve returns only healthy instances', async () => {
    const mockFetch: typeof fetch = (async () => {
      const instances: InstanceInfo[] = [
        sampleInstance,
        { ...sampleInstance, instanceId: 'reports-2', healthy: false },
      ];
      return new Response(JSON.stringify(instances), { status: 200 });
    }) as typeof fetch;

    const client = new RegistryClient({
      registryUrl: 'http://registry:4100',
      internalToken: 'test-token',
      fetch: mockFetch,
    });

    const resolved = await client.resolve('reports');

    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.instanceId).toBe('reports-1');
  });

  it('pick balances round-robin across the healthy instances', async () => {
    const mockFetch: typeof fetch = (async () => {
      const instances: InstanceInfo[] = [
        sampleInstance,
        { ...sampleInstance, instanceId: 'reports-2', baseUrl: 'http://localhost:4501' },
      ];
      return new Response(JSON.stringify(instances), { status: 200 });
    }) as typeof fetch;

    const client = new RegistryClient({
      registryUrl: 'http://registry:4100',
      internalToken: 'test-token',
      fetch: mockFetch,
      resolveCacheTtlMs: 10000,
    });

    const pick1 = await client.pick('reports');
    const pick2 = await client.pick('reports');
    const pick3 = await client.pick('reports');

    expect(pick1.instanceId).toBe('reports-1');
    expect(pick2.instanceId).toBe('reports-2');
    expect(pick3.instanceId).toBe('reports-1');
  });

  it('reuses resolve results for resolveCacheTtlMs instead of calling the registry each time', async () => {
    let callCount = 0;
    const mockFetch: typeof fetch = (async () => {
      callCount++;
      return new Response(JSON.stringify([sampleInstance]), { status: 200 });
    }) as typeof fetch;

    const client = new RegistryClient({
      registryUrl: 'http://registry:4100',
      internalToken: 'test-token',
      fetch: mockFetch,
      resolveCacheTtlMs: 5000,
    });

    await client.resolve('reports');
    await client.resolve('reports');
    await client.resolve('reports');

    expect(callCount).toBe(1);
  });

  it('pick throws NoHealthyInstanceError when no healthy instance exists (doc 3.3)', async () => {
    const mockFetch: typeof fetch = (async () => {
      return new Response(JSON.stringify([]), { status: 200 });
    }) as typeof fetch;

    const client = new RegistryClient({
      registryUrl: 'http://registry:4100',
      internalToken: 'test-token',
      fetch: mockFetch,
    });

    await expect(client.pick('reports')).rejects.toThrow(NoHealthyInstanceError);
  });
});

describe('registry unavailable', () => {
  it('falls back to the static URLs from the environment when the registry cannot be reached', async () => {
    const mockFetch: typeof fetch = (async () => {
      throw new Error('Connection refused');
    }) as typeof fetch;

    const client = new RegistryClient({
      registryUrl: 'http://registry:4100',
      internalToken: 'test-token',
      fetch: mockFetch,
      staticUrls: { reports: 'http://localhost:4500' },
    });

    const resolved = await client.resolve('reports');

    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.baseUrl).toBe('http://localhost:4500');
  });

  it('serves the last known instances for a short grace period', async () => {
    let shouldFail = false;
    const mockFetch: typeof fetch = (async () => {
      if (shouldFail) {
        throw new Error('Registry down');
      }
      return new Response(JSON.stringify([sampleInstance]), { status: 200 });
    }) as typeof fetch;

    const client = new RegistryClient({
      registryUrl: 'http://registry:4100',
      internalToken: 'test-token',
      fetch: mockFetch,
      resolveCacheTtlMs: 1, // expired immediately
    });

    // Initial successful resolve
    const first = await client.resolve('reports');
    expect(first).toHaveLength(1);

    // Registry goes down, cache expired, but falls back to stale cache entry
    shouldFail = true;
    const second = await client.resolve('reports');
    expect(second).toHaveLength(1);
    expect(second[0]?.instanceId).toBe('reports-1');
  });
});
