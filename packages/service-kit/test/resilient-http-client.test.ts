import { HEADERS, type InstanceInfo, type ServiceName } from '@gyde/contracts';
import { NoHealthyInstanceError, type ServiceResolver } from '@gyde/discovery';
import {
  CircuitBreaker,
  type CircuitBreakerOptions,
  CircuitOpenError,
  MemoryFallbackCache,
} from '@gyde/resilience';
import { describe, expect, it } from 'vitest';

import { HttpError } from '../src/errors';
import { ResilientHttpClient, UpstreamServiceError } from '../src/resilient-http-client';

function makeBreakerOptions(
  name: string,
  overrides: Partial<CircuitBreakerOptions> = {},
): CircuitBreakerOptions {
  return {
    name,
    failureThreshold: 2,
    failureRate: 0.5,
    minCalls: 2,
    windowMs: 30_000,
    openTimeoutMs: 15_000,
    halfOpenMaxCalls: 2,
    callTimeoutMs: 10_000,
    ...overrides,
  };
}

class FakeResolver implements ServiceResolver {
  private instances = new Map<ServiceName, InstanceInfo[]>();

  setInstances(service: ServiceName, list: InstanceInfo[]) {
    this.instances.set(service, list);
  }

  async resolve(serviceName: ServiceName): Promise<InstanceInfo[]> {
    return this.instances.get(serviceName) ?? [];
  }

  async pick(serviceName: ServiceName): Promise<InstanceInfo> {
    const list = this.instances.get(serviceName) ?? [];
    const healthy = list.filter((i) => i.healthy);
    if (healthy.length === 0) {
      throw new NoHealthyInstanceError(serviceName);
    }
    return healthy[0]!;
  }
}

describe('ResilientHttpClient', () => {
  it('resolves instance via discovery and calls fetch with headers', async () => {
    const resolver = new FakeResolver();
    resolver.setInstances('reports', [
      {
        instanceId: 'reports-1',
        serviceName: 'reports',
        baseUrl: 'http://reports:4500',
        version: '0.0.0',
        healthy: true,
        registeredAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
      },
    ]);

    let capturedUrl = '';
    let capturedHeaders: Headers | undefined;

    const fakeFetch: typeof fetch = (async (input: string | URL, init?: RequestInit) => {
      capturedUrl = input.toString();
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const client = new ResilientHttpClient({
      serviceName: 'gateway',
      resolver,
      internalToken: 'test-secret',
      fetch: fakeFetch,
    });

    const res = await client.fetch('reports', '/internal/analyses', {
      method: 'POST',
      requestId: 'req-12345',
    });

    expect(res.status).toBe(200);
    expect(capturedUrl).toBe('http://reports:4500/internal/analyses');
    expect(capturedHeaders?.get(HEADERS.requestId)).toBe('req-12345');
    expect(capturedHeaders?.get(HEADERS.internalToken)).toBe('test-secret');
  });

  it('uses fallbackUrls when discovery has no healthy instances', async () => {
    const resolver = new FakeResolver(); // empty

    let capturedUrl = '';
    const fakeFetch: typeof fetch = (async (input: string | URL) => {
      capturedUrl = input.toString();
      return new Response(JSON.stringify({ reports: 'ok' }), { status: 200 });
    }) as typeof fetch;

    const client = new ResilientHttpClient({
      resolver,
      fallbackUrls: { reports: 'http://static-reports:4500' },
      fetch: fakeFetch,
    });

    const res = await client.fetch('reports', '/v1/analyses/123');
    expect(res.status).toBe(200);
    expect(capturedUrl).toBe('http://static-reports:4500/v1/analyses/123');
  });

  it('throws NoHealthyInstanceError when no instance and no fallback exists', async () => {
    const resolver = new FakeResolver(); // empty
    const client = new ResilientHttpClient({ resolver });

    await expect(client.fetch('reports', '/test')).rejects.toThrow(NoHealthyInstanceError);
  });

  it('circuit breaker opens after repeated 500 errors and protects dependency', async () => {
    const resolver = new FakeResolver();
    resolver.setInstances('web', [
      {
        instanceId: 'web-1',
        serviceName: 'web',
        baseUrl: 'http://web:3000',
        version: '0.0.0',
        healthy: true,
        registeredAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
      },
    ]);

    let callCount = 0;
    const fakeFetch: typeof fetch = (async () => {
      callCount++;
      return new Response('internal error', { status: 500 });
    }) as typeof fetch;

    const breaker = new CircuitBreaker(
      makeBreakerOptions('test-breaker', {
        failureThreshold: 2,
        minCalls: 2,
        callTimeoutMs: 1_000,
      }),
    );

    const client = new ResilientHttpClient({
      resolver,
      breakers: { web: breaker },
      fetch: fakeFetch,
    });

    // Calls 1 and 2 fail with 500
    await expect(client.fetch('web', '/ping')).rejects.toThrow(UpstreamServiceError);
    await expect(client.fetch('web', '/ping')).rejects.toThrow(UpstreamServiceError);

    // Call 3: breaker is now open
    expect(breaker.state).toBe('open');
    await expect(client.fetch('web', '/ping')).rejects.toThrow(CircuitOpenError);
    // fetch was not called for call 3
    expect(callCount).toBe(2);
  });

  it('4xx responses do not trip the circuit breaker', async () => {
    const resolver = new FakeResolver();
    resolver.setInstances('web', [
      {
        instanceId: 'web-1',
        serviceName: 'web',
        baseUrl: 'http://web:3000',
        version: '0.0.0',
        healthy: true,
        registeredAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
      },
    ]);

    const fakeFetch: typeof fetch = (async () => {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
    }) as typeof fetch;

    const breaker = new CircuitBreaker(
      makeBreakerOptions('test-breaker', {
        failureThreshold: 2,
        minCalls: 2,
      }),
    );

    const client = new ResilientHttpClient({
      resolver,
      breakers: { web: breaker },
      fetch: fakeFetch,
    });

    const res1 = await client.fetch('web', '/verify');
    expect(res1.status).toBe(401);
    const res2 = await client.fetch('web', '/verify');
    expect(res2.status).toBe(401);

    expect(breaker.state).toBe('closed');
  });

  it('returns cached response from FallbackCache when dependency circuit is open', async () => {
    const resolver = new FakeResolver();
    resolver.setInstances('reports', [
      {
        instanceId: 'reports-1',
        serviceName: 'reports',
        baseUrl: 'http://reports:4500',
        version: '0.0.0',
        healthy: true,
        registeredAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
      },
    ]);

    let shouldFail = false;
    const fakeFetch: typeof fetch = (async () => {
      if (shouldFail) {
        return new Response('service unavailable', { status: 503 });
      }
      return new Response(JSON.stringify({ status: 'completed', score: 85 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const cache = new MemoryFallbackCache<string>({ maxEntries: 10 });
    const breaker = new CircuitBreaker(
      makeBreakerOptions('reports-breaker', {
        failureThreshold: 1,
        minCalls: 1,
        openTimeoutMs: 60_000,
      }),
    );

    const client = new ResilientHttpClient({
      resolver,
      fallbackCache: cache,
      breakers: { reports: breaker },
      fetch: fakeFetch,
    });

    // 1. Initial successful GET call -> cached
    const res1 = await client.fetch('reports', '/v1/analyses/job-1');
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1).toEqual({ status: 'completed', score: 85 });

    // 2. Service goes down
    shouldFail = true;

    // 3. GET call returns cached data while service is down
    const resCached = await client.fetch('reports', '/v1/analyses/job-1');
    expect(resCached.status).toBe(200);
    expect(resCached.headers.get('x-gyde-fallback-cached')).toBe('true');
    const dataCached = await resCached.json();
    expect(dataCached).toEqual({ status: 'completed', score: 85 });

    // 4. An uncached call throws error
    await expect(client.fetch('reports', '/v1/analyses/uncached-job')).rejects.toThrow();
  });

  it('getJson and postJson helpers format requests and parse responses', async () => {
    const resolver = new FakeResolver();
    resolver.setInstances('reports', [
      {
        instanceId: 'reports-1',
        serviceName: 'reports',
        baseUrl: 'http://reports:4500',
        version: '0.0.0',
        healthy: true,
        registeredAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
      },
    ]);

    let postedBody = '';
    const fakeFetch: typeof fetch = (async (input: string | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        postedBody = String(init.body);
        return new Response(JSON.stringify({ created: true }), { status: 201 });
      }
      return new Response(JSON.stringify({ details: 'ok' }), { status: 200 });
    }) as typeof fetch;

    const client = new ResilientHttpClient({ resolver, fetch: fakeFetch });

    const postResult = await client.postJson<{ created: boolean }>('reports', '/analyses', {
      jobId: '123',
    });
    expect(postResult).toEqual({ created: true });
    expect(postedBody).toBe(JSON.stringify({ jobId: '123' }));

    const getResult = await client.getJson<{ details: string }>('reports', '/analyses/123');
    expect(getResult).toEqual({ details: 'ok' });
  });

  it('getJson throws HttpError with not_found code on 404', async () => {
    const resolver = new FakeResolver();
    resolver.setInstances('reports', [
      {
        instanceId: 'reports-1',
        serviceName: 'reports',
        baseUrl: 'http://reports:4500',
        version: '0.0.0',
        healthy: true,
        registeredAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
      },
    ]);

    const fakeFetch: typeof fetch = (async () => {
      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    const client = new ResilientHttpClient({ resolver, fetch: fakeFetch });

    const err = await client.getJson('reports', '/analyses/999').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).code).toBe('not_found');
    expect((err as HttpError).status).toBe(404);
  });

  it('getJson throws HttpError with unauthorized code on 401', async () => {
    const resolver = new FakeResolver();
    resolver.setInstances('web', [
      {
        instanceId: 'web-1',
        serviceName: 'web',
        baseUrl: 'http://web:3000',
        version: '0.0.0',
        healthy: true,
        registeredAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
      },
    ]);

    const fakeFetch: typeof fetch = (async () => {
      return new Response(JSON.stringify({ error: 'invalid key' }), { status: 401 });
    }) as typeof fetch;

    const client = new ResilientHttpClient({ resolver, fetch: fakeFetch });

    const err = await client.getJson('web', '/internal/api-keys/verify').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).code).toBe('unauthorized');
    expect((err as HttpError).status).toBe(401);
  });

  it('postJson throws HttpError with forbidden code on 403', async () => {
    const resolver = new FakeResolver();
    resolver.setInstances('web', [
      {
        instanceId: 'web-1',
        serviceName: 'web',
        baseUrl: 'http://web:3000',
        version: '0.0.0',
        healthy: true,
        registeredAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
      },
    ]);

    const fakeFetch: typeof fetch = (async () => {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });
    }) as typeof fetch;

    const client = new ResilientHttpClient({ resolver, fetch: fakeFetch });

    const err = await client
      .postJson('web', '/some/endpoint', { data: 1 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).code).toBe('forbidden');
    expect((err as HttpError).status).toBe(403);
  });

  describe('upstream error bodies', () => {
    const SECRET = 'db-password=hunter2 stack at /srv/app.js';

    function clientReturning(status: number, logs: Record<string, unknown>[]) {
      const resolver = new FakeResolver();
      resolver.setInstances('reports', [
        {
          instanceId: 'reports-1',
          serviceName: 'reports',
          baseUrl: 'http://reports:4500',
          version: '0.0.0',
          healthy: true,
          registeredAt: new Date().toISOString(),
          lastHeartbeatAt: new Date().toISOString(),
        },
      ]);
      const fakeFetch: typeof fetch = (async () =>
        new Response(SECRET, { status })) as typeof fetch;
      return new ResilientHttpClient({
        resolver,
        fetch: fakeFetch,
        logger: { warn: (obj) => void logs.push(obj) },
      });
    }

    it('keeps the body of a 4xx out of the error and sends it to the logger', async () => {
      const logs: Record<string, unknown>[] = [];
      const client = clientReturning(404, logs);

      const getErr = await client.getJson('reports', '/analyses/9').catch((e: unknown) => e);
      const postErr = await client.postJson('reports', '/analyses', {}).catch((e: unknown) => e);

      for (const err of [getErr, postErr]) {
        expect(err).toBeInstanceOf(HttpError);
        expect((err as HttpError).code).toBe('not_found');
        expect((err as HttpError).message).toBe('reports returned 404');
        expect(JSON.stringify(err)).not.toContain('hunter2');
      }
      expect(logs).toHaveLength(2);
      expect(logs[0]).toMatchObject({ service: 'reports', status: 404, body: SECRET });
    });

    it('keeps the body of a 5xx out of the error and sends it to the logger', async () => {
      const logs: Record<string, unknown>[] = [];
      const client = clientReturning(500, logs);

      const err = await client.getJson('reports', '/analyses/9').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(UpstreamServiceError);
      expect((err as Error).message).toBe('Upstream service reports returned error 500');
      expect((err as Error).message).not.toContain('hunter2');
      expect(logs[0]).toMatchObject({ status: 500, body: SECRET });
    });

    it('truncates the logged body', async () => {
      const logs: Record<string, unknown>[] = [];
      const resolver = new FakeResolver();
      resolver.setInstances('web', [
        {
          instanceId: 'web-1',
          serviceName: 'web',
          baseUrl: 'http://web:3000',
          version: '0.0.0',
          healthy: true,
          registeredAt: new Date().toISOString(),
          lastHeartbeatAt: new Date().toISOString(),
        },
      ]);
      const client = new ResilientHttpClient({
        resolver,
        fetch: (async () => new Response('x'.repeat(5000), { status: 400 })) as typeof fetch,
        logger: { warn: (obj) => void logs.push(obj) },
      });

      await client.getJson('web', '/x').catch(() => undefined);

      expect((logs[0]!.body as string).length).toBe(500);
    });
  });
});
