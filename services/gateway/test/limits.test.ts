import { HEADERS, PLAN_CATALOG } from '@gyde/contracts';
import { sampleAnalysisRequest, sampleReportReady } from '@gyde/contracts/samples';
import { afterEach, describe, expect, it } from 'vitest';

import { configSchema } from '../src/config';
import {
  INTERNAL_TOKEN,
  VALID_KEY,
  bearer,
  fakeFetch,
  json,
  makeApp,
  type RecordedCall,
  type TestAppOptions,
} from './helpers';

const apps: { close(): Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const OTHER_KEY = 'gyde_test_other_key_0123456789';
const accepted = { analysisId: 'analysis-1', status: 'pending' };

function entitlementsWith(analysesPerMonth: number | null) {
  return { ...PLAN_CATALOG.free, limits: { analysesPerMonth, projects: 1 } };
}

/** Web knows two keys (two tenants); Reports answers with `reports`. */
function network(
  analysesPerMonth: number | null,
  reports: (call: RecordedCall) => Response = () => json(accepted, 202),
) {
  return (call: RecordedCall): Response => {
    if (!call.url.startsWith('http://web.test')) return reports(call);
    const { apiKey } = JSON.parse(call.body ?? '{}') as { apiKey: string };
    if (apiKey !== VALID_KEY && apiKey !== OTHER_KEY) {
      return json({ valid: false, reason: 'unknown' });
    }
    return json({
      valid: true,
      tenantId: apiKey === VALID_KEY ? 'tenant-1' : 'tenant-2',
      apiKeyId: apiKey === VALID_KEY ? 'key-1' : 'key-2',
      entitlements: entitlementsWith(analysesPerMonth),
    });
  };
}

async function appWith(
  handler: (call: RecordedCall) => Response,
  options: Partial<TestAppOptions> = {},
) {
  const net = fakeFetch(handler);
  const app = await makeApp({ fetch: net.fn, ...options });
  apps.push(app);
  const post = (key = VALID_KEY, payload: object = sampleAnalysisRequest) =>
    app.inject({ method: 'POST', url: '/v1/analyses', headers: bearer(key), payload });
  const get = (key = VALID_KEY) =>
    app.inject({ method: 'GET', url: '/v1/auth/verify', headers: bearer(key) });
  const toReports = () => net.calls.filter((c) => c.url.startsWith('http://reports.test'));
  return { app, post, get, toReports };
}

describe('plan limit (402 plan_limit_exceeded)', () => {
  it('lets a tenant start as many analyses a month as its plan allows, then answers 402', async () => {
    const { post, toReports } = await appWith(network(2));

    expect((await post()).statusCode).toBe(202);
    expect((await post()).statusCode).toBe(202);
    const refused = await post();

    expect(refused.statusCode).toBe(402);
    expect(refused.json()).toMatchObject({ error: { code: 'plan_limit_exceeded' } });
    expect(refused.json().error.message).toContain('free plan allows 2 analyses per month');
    // The refused request never reached Reports.
    expect(toReports()).toHaveLength(2);
  });

  it('does not limit a plan whose analysesPerMonth is null (unlimited)', async () => {
    const { post, toReports } = await appWith(network(null));
    for (let i = 0; i < 5; i += 1) expect((await post()).statusCode).toBe(202);
    expect(toReports()).toHaveLength(5);
  });

  it('counts each tenant on its own', async () => {
    const { post } = await appWith(network(1));
    expect((await post(VALID_KEY)).statusCode).toBe(202);
    expect((await post(VALID_KEY)).statusCode).toBe(402);
    expect((await post(OTHER_KEY)).statusCode).toBe(202);
  });

  it('starts again with a new month (UTC)', async () => {
    let now = Date.parse('2026-10-31T23:59:00Z');
    const { post } = await appWith(network(1), { now: () => now });

    expect((await post()).statusCode).toBe(202);
    expect((await post()).statusCode).toBe(402);

    now = Date.parse('2026-11-01T00:00:01Z');
    expect((await post()).statusCode).toBe(202);
  });

  it('gives the analysis back when Reports does not accept it', async () => {
    let reportsUp = false;
    const { post } = await appWith(
      network(1, () => (reportsUp ? json(accepted, 202) : new Response('boom', { status: 500 }))),
    );

    expect((await post()).statusCode).toBe(503);
    reportsUp = true;
    // The outage did not cost the customer the only analysis of the month.
    expect((await post()).statusCode).toBe(202);
    expect((await post()).statusCode).toBe(402);
  });

  it('does not spend allowance on a request with an invalid body', async () => {
    const { post } = await appWith(network(1));
    expect((await post(VALID_KEY, { x: 1 })).statusCode).toBe(400);
    expect((await post()).statusCode).toBe(202);
  });

  it('only applies to creating analyses, not to reading', async () => {
    const { post, get } = await appWith(network(1));
    expect((await post()).statusCode).toBe(202);
    expect((await post()).statusCode).toBe(402);
    expect((await get()).statusCode).toBe(200);
  });
});

describe('rate limit default', () => {
  it('is 300 per minute', () => {
    const config = configSchema.parse({ INTERNAL_SERVICE_TOKEN: INTERNAL_TOKEN });
    expect(config.GATEWAY_RATE_LIMIT_PER_MINUTE).toBe(300);
  });

  it('does not limit the CLI polling an analysis every 500 ms for a whole minute', async () => {
    const { app } = await appWith(
      network(null, () => json(sampleReportReady)),
      {
        now: () => 1_000_000,
      },
    );

    // 120 polls in a minute (500 ms apart) plus the verify and the POST that precede them.
    let limited = 0;
    for (let i = 0; i < 122; i += 1) {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/analyses/analysis-0001',
        headers: bearer(VALID_KEY),
      });
      if (res.statusCode === 429) limited += 1;
    }
    expect(limited).toBe(0);
  });
});

describe('rate limit (429 rate_limited)', () => {
  it('answers 429 with Retry-After once a key spends its requests in the window', async () => {
    const { get } = await appWith(network(null), { rateLimitPerMinute: 3, now: () => 1_000_000 });

    for (let i = 0; i < 3; i += 1) expect((await get()).statusCode).toBe(200);
    const limited = await get();

    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ error: { code: 'rate_limited' } });
    expect(limited.headers['retry-after']).toBe('60');
  });

  it('opens a new window after a minute and reports the remaining wait', async () => {
    let now = 1_000_000;
    const { get } = await appWith(network(null), { rateLimitPerMinute: 1, now: () => now });

    expect((await get()).statusCode).toBe(200);
    now += 20_000;
    const limited = await get();
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBe('40');

    now += 40_000;
    expect((await get()).statusCode).toBe(200);
  });

  it('counts each key on its own', async () => {
    const { get } = await appWith(network(null), { rateLimitPerMinute: 1, now: () => 1_000_000 });
    expect((await get(VALID_KEY)).statusCode).toBe(200);
    expect((await get(VALID_KEY)).statusCode).toBe(429);
    expect((await get(OTHER_KEY)).statusCode).toBe(200);
  });

  it('does not count requests that fail authentication', async () => {
    const { get } = await appWith(network(null), { rateLimitPerMinute: 1, now: () => 1_000_000 });
    for (let i = 0; i < 5; i += 1) {
      expect((await get('gyde_test_unknown_key_000000')).statusCode).toBe(401);
    }
    expect((await get()).statusCode).toBe(200);
  });

  it('applies before the body is validated and before the plan limit is checked', async () => {
    const { post } = await appWith(network(1), { rateLimitPerMinute: 2, now: () => 1_000_000 });

    expect((await post()).statusCode).toBe(202);
    // Second request: the allowance is over (402), not the rate yet.
    expect((await post()).statusCode).toBe(402);
    // Third request: the rate is over, whatever the body or the allowance.
    expect((await post(VALID_KEY, { x: 1 })).statusCode).toBe(429);
  });

  it('keeps the limit in a header-free envelope: no key, no tenant in the body', async () => {
    const { get } = await appWith(network(null), { rateLimitPerMinute: 1, now: () => 1_000_000 });
    await get();
    const limited = await get();
    expect(limited.body).not.toContain(VALID_KEY);
    expect(limited.body).not.toContain('tenant-1');
    expect(limited.headers[HEADERS.requestId]).toBeTruthy();
  });
});
