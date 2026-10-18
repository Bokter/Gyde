import { HEADERS } from '@gyde/contracts';
import { createLogger } from '@gyde/service-kit';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { configSchema } from '../src/config';
import { createApp } from '../src/http/app';

/**
 * Pins the exact HTTP responses of the registry before and after the Clean Architecture
 * refactor (WP-1): status, content type and body. Assertions must not change with it.
 */
const token = 'test-internal-token-123456';
const config = configSchema.parse({ INTERNAL_SERVICE_TOKEN: token });
const now = () => 1_000_000;
const iso = new Date(now()).toISOString();

const app = await createApp({
  config,
  logger: createLogger({ name: 'registry-characterization', level: 'silent' }),
  overrides: { now },
});
const auth = { [HEADERS.internalToken]: token };

const registration = {
  serviceName: 'reports',
  instanceId: 'reports-1',
  baseUrl: 'http://reports:4500',
  version: '0.0.0',
  metadata: { zone: 'a' },
};

afterAll(() => app.close());

beforeEach(async () => {
  await app.inject({ method: 'DELETE', url: '/v1/instances/reports-1', headers: auth });
});

const expectedInfo = {
  instanceId: 'reports-1',
  serviceName: 'reports',
  baseUrl: 'http://reports:4500',
  version: '0.0.0',
  healthy: true,
  registeredAt: iso,
  lastHeartbeatAt: iso,
};

describe('registry HTTP responses (characterization)', () => {
  it('heartbeat of an unknown instance answers 404 with the exact ApiError', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/instances/nope/heartbeat',
      headers: auth,
    });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
    expect(JSON.parse(res.body)).toEqual({
      error: {
        code: 'not_found',
        message: 'Instance "nope" is not registered',
        requestId: expect.any(String),
      },
    });
  });

  it('register answers 201 with the instance info (no metadata exposed)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/instances',
      headers: auth,
      payload: registration,
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body)).toEqual(expectedInfo);
  });

  it('heartbeat answers 200 with the instance info', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/instances',
      headers: auth,
      payload: registration,
    });
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/instances/reports-1/heartbeat',
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual(expectedInfo);
  });

  it('deregister answers 200 { ok: true }, also for an unknown instance', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/instances',
      headers: auth,
      payload: registration,
    });
    for (const id of ['reports-1', 'nope']) {
      const res = await app.inject({ method: 'DELETE', url: `/v1/instances/${id}`, headers: auth });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ ok: true });
    }
  });

  it('resolve lists the healthy instances in the exact contract shape', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/instances',
      headers: auth,
      payload: registration,
    });
    const res = await app.inject({ method: 'GET', url: '/v1/services/reports', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ serviceName: 'reports', instances: [expectedInfo] });
  });

  it('resolve of a service without instances answers 200 with an empty list', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/services/gateway', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ serviceName: 'gateway', instances: [] });
  });

  it('resolve with an invalid serviceName is NOT validated today: 200 with an empty list', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/services/bogus', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ serviceName: 'bogus', instances: [] });
  });

  it('an invalid registration answers 400 invalid_request with details', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/instances',
      headers: auth,
      payload: { serviceName: 'x' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('invalid_request');
    expect(body.error.message).toBe('Request validation failed');
    expect(body.error.details.map((d: { path: string }) => d.path)).toEqual([
      'serviceName',
      'instanceId',
      'baseUrl',
      'version',
    ]);
  });
});
