import { HEADERS } from '@gyde/contracts';
import { createLogger } from '@gyde/service-kit';
import { describe, expect, it } from 'vitest';

import { configSchema } from '../src/config';
import { createApp } from '../src/http/app';

const token = 'test-internal-token-123456';
const config = configSchema.parse({ INTERNAL_SERVICE_TOKEN: token });
const app = createApp({ config, logger: createLogger({ name: 'registry-test', level: 'silent' }) });
const auth = { [HEADERS.internalToken]: token };

const registration = {
  serviceName: 'reports',
  instanceId: 'reports-1',
  baseUrl: 'http://reports:4500',
  version: '0.0.0',
};

describe('registry skeleton', () => {
  it('keeps /healthz public so the platform can probe it', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
  });

  it('refuses every /v1 call without the internal token', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/instances', payload: registration });
    expect(res.statusCode).toBe(401);
  });

  it('validates the registration body and answers 501 until implemented', async () => {
    const invalid = await app.inject({
      method: 'POST',
      url: '/v1/instances',
      headers: auth,
      payload: { serviceName: 'not-a-service' },
    });
    expect(invalid.statusCode).toBe(400);

    const valid = await app.inject({
      method: 'POST',
      url: '/v1/instances',
      headers: auth,
      payload: registration,
    });
    expect(valid.statusCode).toBe(501);
  });
});

/** Acceptance criteria for Area 1 (architecture doc, tables 3.1 and 3.3). */
describe('registry behavior still to implement', () => {
  it.todo('POST /v1/instances registers an instance and answers 201');
  it.todo('PUT /v1/instances/:id/heartbeat refreshes the instance; 404 when unknown');
  it.todo('DELETE /v1/instances/:id removes the instance (graceful shutdown)');
  it.todo('GET /v1/services/:name lists only healthy instances');
  it.todo('drops an instance whose heartbeat is older than INSTANCE_TTL_MS');
  it.todo('Health Checker probes /healthz of every instance every HEALTH_CHECK_INTERVAL_MS');
  it.todo('Health Checker removes an instance after HEALTH_CHECK_MAX_FAILURES failed probes');
  it.todo('an instance that recovers and registers again becomes resolvable again');
  it.todo('resolving a service with no healthy instance returns an empty list (not an error)');
});
