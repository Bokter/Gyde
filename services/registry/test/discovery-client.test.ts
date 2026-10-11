import { HEADERS } from '@gyde/contracts';
import { RegistryClient } from '@gyde/discovery';
import { createLogger } from '@gyde/service-kit';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { configSchema } from '../src/config';
import { createApp } from '../src/http/app';

/**
 * `@gyde/discovery` against the REAL registry app (no test double of the server): the client's
 * fetch is routed into `app.inject`, so the wire shapes and headers are the ones Fastify sees.
 */
const token = 'test-internal-token-123456';
const config = configSchema.parse({ INTERNAL_SERVICE_TOKEN: token });

const app = await createApp({
  config,
  logger: createLogger({ name: 'registry-discovery-test', level: 'silent' }),
  // The health probe is not under test here: every instance answers /healthz.
  overrides: { fetch: (async () => new Response(null, { status: 200 })) as typeof fetch },
});

const seen: { method: string; url: string; headers: Record<string, string> }[] = [];

/** Sends the client's request through `app.inject` and returns the real response. */
const injectFetch: typeof fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(input.toString());
  const headers = Object.fromEntries(new Headers(init?.headers).entries());
  const method = (init?.method ?? 'GET') as 'GET' | 'POST' | 'PUT' | 'DELETE';
  seen.push({ method, url: url.pathname, headers });
  const res = await app.inject({
    method,
    url: url.pathname,
    headers,
    ...(typeof init?.body === 'string' ? { payload: init.body } : {}),
  });
  return new Response(res.body.length > 0 ? res.body : null, { status: res.statusCode });
}) as typeof fetch;

const warnings: Record<string, unknown>[] = [];

const client = new RegistryClient({
  registryUrl: 'http://registry.test',
  internalToken: token,
  fetch: injectFetch,
  resolveCacheTtlMs: 0,
  staticUrls: { reports: 'http://static-reports:9999' },
  logger: { warn: (obj) => void warnings.push(obj) },
});

const registration = {
  serviceName: 'reports',
  instanceId: 'reports-1',
  baseUrl: 'http://reports:4500',
  version: '0.0.0',
  metadata: {},
} as const;

afterAll(() => app.close());

beforeEach(async () => {
  seen.length = 0;
  warnings.length = 0;
  await app.inject({
    method: 'DELETE',
    url: '/v1/instances/reports-1',
    headers: { [HEADERS.internalToken]: token },
  });
});

describe('RegistryClient against the real registry', () => {
  it('resolve returns the discovered instance, not the static fallback', async () => {
    await client.register(registration);

    const instances = await client.resolve('reports');

    expect(instances).toHaveLength(1);
    expect(instances[0]?.instanceId).toBe('reports-1');
    expect(instances[0]?.baseUrl).toBe('http://reports:4500');
    expect(warnings).toEqual([]);
  });

  it('pick returns the discovered instance too', async () => {
    await client.register(registration);

    const picked = await client.pick('reports');

    expect(picked.baseUrl).toBe('http://reports:4500');
  });

  it('heartbeat and deregister carry no Content-Type and the registry does not answer 400', async () => {
    await client.register(registration);

    await client.heartbeat('reports-1');
    await client.deregister('reports-1');

    const bodyless = seen.filter((r) => r.method === 'PUT' || r.method === 'DELETE');
    expect(bodyless).toHaveLength(2);
    for (const request of bodyless) {
      expect(request.headers['content-type']).toBeUndefined();
    }
  });

  it('PUT heartbeat without Content-Type answers 200, or 404 for an unknown instance, never 400', async () => {
    const headers = { [HEADERS.internalToken]: token };
    await client.register(registration);

    const known = await app.inject({
      method: 'PUT',
      url: '/v1/instances/reports-1/heartbeat',
      headers,
    });
    const unknown = await app.inject({
      method: 'PUT',
      url: '/v1/instances/nobody/heartbeat',
      headers,
    });

    expect(known.statusCode).toBe(200);
    expect(unknown.statusCode).toBe(404);
  });

  it('after a deregister the registry lists nothing, which is not a failure to log', async () => {
    await client.register(registration);
    await client.deregister('reports-1');

    const instances = await client.resolve('reports');

    // The registry answered fine with an empty list: that is not a failure to log.
    expect(instances).toEqual([]);
    expect(warnings).toEqual([]);
  });
});
