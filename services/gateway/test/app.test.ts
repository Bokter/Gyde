import { sampleAnalysisRequest } from '@gyde/contracts/samples';
import { createLogger } from '@gyde/service-kit';
import { describe, expect, it } from 'vitest';

import { configSchema } from '../src/config';
import { createApp } from '../src/http/app';

const config = configSchema.parse({ INTERNAL_SERVICE_TOKEN: 'test-internal-token-123456' });
const app = createApp({ config, logger: createLogger({ name: 'gateway-test', level: 'silent' }) });

describe('gateway skeleton', () => {
  it('is alive', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ service: 'gateway' });
  });

  it('exposes the public contract as 501 stubs and validates the body first', async () => {
    const invalid = await app.inject({ method: 'POST', url: '/v1/analyses', payload: { x: 1 } });
    expect(invalid.statusCode).toBe(400);

    const valid = await app.inject({
      method: 'POST',
      url: '/v1/analyses',
      payload: sampleAnalysisRequest,
    });
    expect(valid.statusCode).toBe(501);
  });

  it('never serves /internal routes (they are service-to-service only)', async () => {
    const res = await app.inject({ method: 'GET', url: '/internal/analyses/anything' });
    expect(res.statusCode).toBe(404);
  });
});

/** Acceptance criteria for Area 1. Turn each `it.todo` into a real test as you build it. */
describe('gateway behavior still to implement', () => {
  it.todo('rejects a missing or invalid API key with 401, using the Web introspection endpoint');
  it.todo('caches a successful key verification briefly and revalidates when it expires');
  it.todo('enforces the plan limits (analyses per month) with 402 plan_limit_exceeded');
  it.todo('applies a per-key rate limit with 429 rate_limited');
  it.todo('resolves a Reports instance through the registry and calls it behind a circuit breaker');
  it.todo('propagates x-request-id and x-gyde-tenant-id to the downstream services');
  it.todo('answers 503 upstream_unavailable (never hangs) when no healthy instance exists');
  it.todo('POST /v1/analyses answers 202 with the analysisId created by Reports');
  it.todo('GET /v1/analyses/:id returns the Report validated with the contract schema');
});
