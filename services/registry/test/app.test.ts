import { HEADERS } from '@gyde/contracts';
import { createLogger } from '@gyde/service-kit';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { HEALTH_CHECKER, type HealthChecker } from '../src/infrastructure/health-checker';
import { configSchema } from '../src/config';
import { createApp } from '../src/http/app';

const token = 'test-internal-token-123456';
const config = configSchema.parse({
  INTERNAL_SERVICE_TOKEN: token,
  INSTANCE_TTL_MS: 15_000,
  HEALTH_CHECK_INTERVAL_MS: 5_000,
  HEALTH_CHECK_MAX_FAILURES: 3,
});

let currentTime = 1_000_000;
const now = () => currentTime;
const advanceTime = (ms: number) => {
  currentTime += ms;
};

let probeHandler: (url: string) => Promise<Response> = async () =>
  new Response(null, { status: 200 });
const testFetch: typeof fetch = (async (input: string | URL | Request) => {
  const url = input.toString();
  return probeHandler(url);
}) as typeof fetch;

const app = await createApp({
  config,
  logger: createLogger({ name: 'registry-test', level: 'silent' }),
  overrides: {
    now,
    fetch: testFetch,
  },
});

const auth = { [HEADERS.internalToken]: token };

const registration = {
  serviceName: 'reports',
  instanceId: 'reports-1',
  baseUrl: 'http://reports:4500',
  version: '0.0.0',
};

afterAll(() => app.close());

beforeEach(async () => {
  currentTime = 1_000_000;
  probeHandler = async () => new Response(null, { status: 200 });
  // Clean up existing registrations by deregistering
  await app.inject({ method: 'DELETE', url: '/v1/instances/reports-1', headers: auth });
  await app.inject({ method: 'DELETE', url: '/v1/instances/reports-2', headers: auth });
});

describe('registry skeleton', () => {
  it('keeps /healthz public so the platform can probe it', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
  });

  it('refuses every /v1 call without the internal token', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/instances', payload: registration });
    expect(res.statusCode).toBe(401);
  });

  it('validates the registration body and rejects invalid payloads', async () => {
    const invalid = await app.inject({
      method: 'POST',
      url: '/v1/instances',
      headers: auth,
      payload: { serviceName: 'not-a-service' },
    });
    expect(invalid.statusCode).toBe(400);
  });
});

describe('registry acceptance criteria (doc 3.1 & 3.3)', () => {
  it('POST /v1/instances registers an instance and answers 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/instances',
      headers: auth,
      payload: registration,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.instanceId).toBe('reports-1');
    expect(body.serviceName).toBe('reports');
    expect(body.healthy).toBe(true);
  });

  it('PUT /v1/instances/:id/heartbeat refreshes the instance; 404 when unknown', async () => {
    // 404 for unknown instance
    const unknownRes = await app.inject({
      method: 'PUT',
      url: '/v1/instances/non-existent/heartbeat',
      headers: auth,
    });
    expect(unknownRes.statusCode).toBe(404);

    // Register first
    await app.inject({
      method: 'POST',
      url: '/v1/instances',
      headers: auth,
      payload: registration,
    });

    // Advance time and touch heartbeat
    advanceTime(5_000);
    const heartbeatRes = await app.inject({
      method: 'PUT',
      url: '/v1/instances/reports-1/heartbeat',
      headers: auth,
    });

    expect(heartbeatRes.statusCode).toBe(200);
    const body = JSON.parse(heartbeatRes.body);
    expect(body.instanceId).toBe('reports-1');
    expect(new Date(body.lastHeartbeatAt).getTime()).toBe(currentTime);
  });

  it('DELETE /v1/instances/:id removes the instance (graceful shutdown)', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/instances',
      headers: auth,
      payload: registration,
    });

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: '/v1/instances/reports-1',
      headers: auth,
    });
    expect(deleteRes.statusCode).toBe(200);

    const resolveRes = await app.inject({
      method: 'GET',
      url: '/v1/services/reports',
      headers: auth,
    });
    const body = JSON.parse(resolveRes.body);
    expect(body.instances).toHaveLength(0);
  });

  it('GET /v1/services/:name lists only healthy instances', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/instances',
      headers: auth,
      payload: registration,
    });

    const resolveRes = await app.inject({
      method: 'GET',
      url: '/v1/services/reports',
      headers: auth,
    });

    expect(resolveRes.statusCode).toBe(200);
    const body = JSON.parse(resolveRes.body);
    expect(body.serviceName).toBe('reports');
    expect(body.instances).toHaveLength(1);
    expect(body.instances[0].instanceId).toBe('reports-1');
  });

  it('drops an instance whose heartbeat is older than INSTANCE_TTL_MS', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/instances',
      headers: auth,
      payload: registration,
    });

    // Advance past TTL (15s)
    advanceTime(16_000);

    // Resolve should now filter out expired instance
    const resolveRes = await app.inject({
      method: 'GET',
      url: '/v1/services/reports',
      headers: auth,
    });

    const body = JSON.parse(resolveRes.body);
    expect(body.instances).toHaveLength(0);
  });

  it('Health Checker probes /healthz of every instance every HEALTH_CHECK_INTERVAL_MS', async () => {
    const probedUrls: string[] = [];
    probeHandler = async (url: string) => {
      probedUrls.push(url);
      return new Response(null, { status: 200 });
    };

    await app.inject({
      method: 'POST',
      url: '/v1/instances',
      headers: auth,
      payload: registration,
    });

    const healthChecker = app.get<HealthChecker>(HEALTH_CHECKER);
    await healthChecker.runOnce();

    expect(probedUrls).toContain('http://reports:4500/healthz');
  });

  it('Health Checker removes an instance after HEALTH_CHECK_MAX_FAILURES failed probes', async () => {
    // Failing probe handler
    probeHandler = async () => new Response(null, { status: 503 });

    await app.inject({
      method: 'POST',
      url: '/v1/instances',
      headers: auth,
      payload: registration,
    });

    const healthChecker = app.get<HealthChecker>(HEALTH_CHECKER);

    // Probe failure 1
    await healthChecker.runOnce();
    const resolveRes = await app.inject({
      method: 'GET',
      url: '/v1/services/reports',
      headers: auth,
    });
    // Healthy flag is false
    expect(JSON.parse(resolveRes.body).instances).toHaveLength(0);

    // Probe failure 2
    await healthChecker.runOnce();
    // Probe failure 3 (reaches max failures = 3 -> removed)
    await healthChecker.runOnce();

    // Verification: instance was removed from registry
    const heartbeatRes = await app.inject({
      method: 'PUT',
      url: '/v1/instances/reports-1/heartbeat',
      headers: auth,
    });
    expect(heartbeatRes.statusCode).toBe(404);
  });

  it('an instance that recovers and registers again becomes resolvable again', async () => {
    // Failing probe
    probeHandler = async () => new Response(null, { status: 503 });

    await app.inject({
      method: 'POST',
      url: '/v1/instances',
      headers: auth,
      payload: registration,
    });

    const healthChecker = app.get<HealthChecker>(HEALTH_CHECKER);
    await healthChecker.runOnce();

    // Initially unhealthy
    const initialResolveRes = await app.inject({
      method: 'GET',
      url: '/v1/services/reports',
      headers: auth,
    });
    expect(JSON.parse(initialResolveRes.body).instances).toHaveLength(0);

    // Instance recovers: probe returns 200 and instance registers again
    probeHandler = async () => new Response(null, { status: 200 });
    await app.inject({
      method: 'POST',
      url: '/v1/instances',
      headers: auth,
      payload: registration,
    });

    const recoveredResolveRes = await app.inject({
      method: 'GET',
      url: '/v1/services/reports',
      headers: auth,
    });
    expect(JSON.parse(recoveredResolveRes.body).instances).toHaveLength(1);
    expect(JSON.parse(recoveredResolveRes.body).instances[0].healthy).toBe(true);
  });

  it('resolving a service with no healthy instance returns an empty list (not an error)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/services/gateway',
      headers: auth,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.serviceName).toBe('gateway');
    expect(body.instances).toEqual([]);
  });
});
