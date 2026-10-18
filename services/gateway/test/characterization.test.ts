import { PLAN_CATALOG } from '@gyde/contracts';
import { sampleAnalysisRequest, sampleReportReady } from '@gyde/contracts/samples';
import { HttpError } from '@gyde/service-kit';
import type { ExecutionContext } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';

import { EnforceRateLimit } from '../src/application/enforce-rate-limit';
import { RateLimitGuard } from '../src/http/rate-limit.guard';
import {
  REVOKED_KEY,
  VALID_KEY,
  bearer,
  fakeFetch,
  json,
  makeApp,
  webAnswer,
  type RecordedCall,
  type TestAppOptions,
} from './helpers';

/**
 * Pins the exact HTTP responses of the gateway (status, content type, body and the headers that
 * matter) before and after the Clean Architecture refactor (WP-2A). Assertions must not change
 * with it.
 */
const apps: { close(): Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function appWith(
  handler: (call: RecordedCall) => Response | Promise<Response>,
  options: Partial<TestAppOptions> = {},
) {
  const network = fakeFetch(handler);
  const app = await makeApp({ fetch: network.fn, ...options });
  apps.push(app);
  const toWeb = () => network.calls.filter((c) => c.url.startsWith('http://web.test'));
  const toReports = () => network.calls.filter((c) => c.url.startsWith('http://reports.test'));
  return { app, calls: network.calls, toWeb, toReports };
}

const JSON_TYPE = 'application/json; charset=utf-8';
const MARKDOWN_TYPE = 'text/markdown; charset=utf-8';
const REQUEST_ID = 'req-char';
const withId = (key: string) => ({ ...bearer(key), 'x-request-id': REQUEST_ID });

const unauthorizedBody = {
  error: { code: 'unauthorized', message: 'Missing or invalid API key', requestId: REQUEST_ID },
};
const upstreamBody = {
  error: {
    code: 'upstream_unavailable',
    message: 'The service is temporarily unavailable',
    requestId: REQUEST_ID,
  },
};

/** Web answers `webAnswer`, Reports answers `reports`. */
function network(reports: (call: RecordedCall) => Response | Promise<Response> = () => json({})) {
  return (call: RecordedCall) =>
    call.url.startsWith('http://web.test') ? webAnswer(call) : reports(call);
}

/** Web knows one key whose entitlements are `entitlements`. */
function webWith(entitlements: unknown, reports: (call: RecordedCall) => Response) {
  return (call: RecordedCall): Response => {
    if (!call.url.startsWith('http://web.test')) return reports(call);
    return json({ valid: true, tenantId: 'tenant-1', apiKeyId: 'key-1', entitlements });
  };
}

describe('401 unauthorized (characterization)', () => {
  it('answers the exact envelope when the header is missing', async () => {
    const { app, toWeb } = await appWith(network());
    const res = await app.inject({
      method: 'GET',
      url: '/v1/auth/verify',
      headers: { 'x-request-id': REQUEST_ID },
    });

    expect(res.statusCode).toBe(401);
    expect(res.headers['content-type']).toBe(JSON_TYPE);
    expect(res.headers['x-request-id']).toBe(REQUEST_ID);
    expect(res.headers['retry-after']).toBeUndefined();
    expect(res.headers['www-authenticate']).toBeUndefined();
    expect(res.json()).toEqual(unauthorizedBody);
    expect(toWeb()).toHaveLength(0);
  });

  it.each([
    ['a Bearer scheme without token', 'Bearer'],
    ['a Bearer token with a space inside', `Bearer ${VALID_KEY} extra`],
    ['another scheme', `Basic ${VALID_KEY}`],
    ['a key of 9 characters', 'Bearer 123456789'],
    ['a key of 201 characters', `Bearer ${'k'.repeat(201)}`],
  ])('answers the same envelope, without calling Web, for %s', async (_name, authorization) => {
    const { app, toWeb } = await appWith(network());
    const res = await app.inject({
      method: 'GET',
      url: '/v1/auth/verify',
      headers: { authorization, 'x-request-id': REQUEST_ID },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(unauthorizedBody);
    expect(toWeb()).toHaveLength(0);
  });

  it('sends keys of exactly 10 and 200 characters to Web', async () => {
    const { app, toWeb } = await appWith(() => json({ valid: false, reason: 'unknown' }));
    for (const length of [10, 200]) {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/auth/verify',
        headers: withId('k'.repeat(length)),
      });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual(unauthorizedBody);
    }
    expect(toWeb()).toHaveLength(2);
  });

  it('accepts the Bearer scheme in any letter case', async () => {
    const { app } = await appWith(network());
    const res = await app.inject({
      method: 'GET',
      url: '/v1/auth/verify',
      headers: { authorization: `bearer ${VALID_KEY}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it.each(['unknown', 'revoked', 'expired', 'suspended'])(
    'answers the same envelope when Web says the key is %s',
    async (reason) => {
      const { app } = await appWith(() => json({ valid: false, reason }));
      const res = await app.inject({
        method: 'GET',
        url: '/v1/auth/verify',
        headers: withId(REVOKED_KEY),
      });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual(unauthorizedBody);
      expect(res.body).not.toContain(REVOKED_KEY);
    },
  );

  it('does not let a rejected request reach the rate limiter or Reports', async () => {
    const { app, toReports } = await appWith(network(), { rateLimitPerMinute: 1 });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/analyses',
      headers: { 'x-request-id': REQUEST_ID },
      payload: sampleAnalysisRequest,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(unauthorizedBody);
    expect(toReports()).toHaveLength(0);
  });
});

describe('503 upstream_unavailable (characterization)', () => {
  it('answers the exact generic envelope when Web fails', async () => {
    const { app } = await appWith(() => new Response('db password is hunter2', { status: 500 }));
    const res = await app.inject({
      method: 'GET',
      url: '/v1/auth/verify',
      headers: withId(VALID_KEY),
    });
    expect(res.statusCode).toBe(503);
    expect(res.headers['content-type']).toBe(JSON_TYPE);
    expect(res.json()).toEqual(upstreamBody);
  });

  it('answers 503 when Web answers a body that does not fit the contract', async () => {
    const { app } = await appWith(() => json({ valid: true }));
    const res = await app.inject({
      method: 'GET',
      url: '/v1/auth/verify',
      headers: withId(VALID_KEY),
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual(upstreamBody);
  });

  it('answers the exact generic envelope when Reports fails on a POST', async () => {
    const { app } = await appWith(network(() => new Response('boom', { status: 500 })));
    const res = await app.inject({
      method: 'POST',
      url: '/v1/analyses',
      headers: withId(VALID_KEY),
      payload: sampleAnalysisRequest,
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual(upstreamBody);
  });

  it('answers 503 when Reports fails on the Markdown', async () => {
    const { app } = await appWith(network(() => new Response('boom', { status: 500 })));
    const res = await app.inject({
      method: 'GET',
      url: '/v1/analyses/analysis-0001/markdown',
      headers: withId(VALID_KEY),
    });
    expect(res.statusCode).toBe(503);
    expect(res.headers['content-type']).toBe(JSON_TYPE);
    expect(res.json()).toEqual(upstreamBody);
  });
});

describe('402 plan_limit_exceeded (characterization)', () => {
  it.each([
    ['free', PLAN_CATALOG.free, 'The free plan allows 30 analyses per month'],
    [
      'pro',
      { ...PLAN_CATALOG.pro, limits: { analysesPerMonth: 1, projects: 10 } },
      'The pro plan allows 1 analyses per month',
    ],
  ])('answers the exact envelope for the %s plan', async (_plan, entitlements, sentence) => {
    const limit = entitlements.limits.analysesPerMonth as number;
    const { app, toReports } = await appWith(
      webWith(entitlements, () => json({ analysisId: 'a', status: 'pending' }, 202)),
    );
    const post = () =>
      app.inject({
        method: 'POST',
        url: '/v1/analyses',
        headers: withId(VALID_KEY),
        payload: sampleAnalysisRequest,
      });

    for (let i = 0; i < limit; i += 1) expect((await post()).statusCode).toBe(202);
    const refused = await post();

    expect(refused.statusCode).toBe(402);
    expect(refused.headers['content-type']).toBe(JSON_TYPE);
    expect(refused.headers['retry-after']).toBeUndefined();
    expect(refused.json()).toEqual({
      error: {
        code: 'plan_limit_exceeded',
        message: `${sentence} and this tenant has used them`,
        requestId: REQUEST_ID,
      },
    });
    expect(toReports()).toHaveLength(limit);
  });
});

describe('429 rate_limited (characterization)', () => {
  it('answers the exact envelope with Retry-After, and only there', async () => {
    const { app } = await appWith(network(), { rateLimitPerMinute: 1, now: () => 1_000_000 });
    const get = () =>
      app.inject({ method: 'GET', url: '/v1/auth/verify', headers: withId(VALID_KEY) });

    const allowed = await get();
    expect(allowed.statusCode).toBe(200);
    expect(allowed.headers['retry-after']).toBeUndefined();

    const limited = await get();
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['content-type']).toBe(JSON_TYPE);
    expect(limited.headers['retry-after']).toBe('60');
    expect(Object.keys(limited.headers).filter((h) => h.startsWith('x-ratelimit'))).toEqual([]);
    expect(limited.json()).toEqual({
      error: {
        code: 'rate_limited',
        message: 'Too many requests: slow down and retry later',
        requestId: REQUEST_ID,
      },
    });
  });

  it('never tells the caller to wait less than one second', async () => {
    let now = 1_000_000;
    const { app } = await appWith(network(), { rateLimitPerMinute: 1, now: () => now });
    const get = () =>
      app.inject({ method: 'GET', url: '/v1/auth/verify', headers: bearer(VALID_KEY) });

    await get();
    now += 59_500;
    const limited = await get();
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBe('1');
  });

  it('rounds the remaining wait up to whole seconds', async () => {
    let now = 1_000_000;
    const { app } = await appWith(network(), { rateLimitPerMinute: 1, now: () => now });
    const get = () =>
      app.inject({ method: 'GET', url: '/v1/auth/verify', headers: bearer(VALID_KEY) });

    await get();
    now += 20_001;
    expect((await get()).headers['retry-after']).toBe('40');
  });

  it('refuses a request without principal with the 401 envelope (defensive guard branch)', () => {
    const guard = new RateLimitGuard(
      new EnforceRateLimit({ consume: () => ({ allowed: true, retryAfterSeconds: 0 }) }),
    );
    const context = {
      switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }),
    } as unknown as ExecutionContext;

    let thrown: unknown;
    try {
      guard.canActivate(context);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(HttpError);
    expect(thrown).toMatchObject({
      code: 'unauthorized',
      status: 401,
      message: 'Missing or invalid API key',
    });
  });
});

describe('200 and 202 responses (characterization)', () => {
  it('GET /v1/auth/verify answers JSON with the request id', async () => {
    const { app } = await appWith(network());
    const res = await app.inject({
      method: 'GET',
      url: '/v1/auth/verify',
      headers: withId(VALID_KEY),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe(JSON_TYPE);
    expect(res.headers['x-request-id']).toBe(REQUEST_ID);
    expect(res.json()).toEqual({ plan: 'pro', entitlements: PLAN_CATALOG.pro });
    expect(Object.keys(res.json())).toEqual(['plan', 'entitlements']);
  });

  it('POST /v1/analyses answers 202 JSON', async () => {
    const accepted = { analysisId: 'analysis-42', status: 'pending' };
    const { app } = await appWith(network(() => json(accepted, 202)));
    const res = await app.inject({
      method: 'POST',
      url: '/v1/analyses',
      headers: withId(VALID_KEY),
      payload: sampleAnalysisRequest,
    });
    expect(res.statusCode).toBe(202);
    expect(res.headers['content-type']).toBe(JSON_TYPE);
    expect(res.json()).toEqual(accepted);
  });

  it('GET /v1/analyses/:id answers the Report as JSON', async () => {
    const { app } = await appWith(network(() => json(sampleReportReady)));
    const res = await app.inject({
      method: 'GET',
      url: '/v1/analyses/analysis-0001',
      headers: withId(VALID_KEY),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe(JSON_TYPE);
    expect(res.json()).toEqual(sampleReportReady);
  });

  it('GET /v1/analyses/:id/markdown answers exactly text/markdown; charset=utf-8', async () => {
    const { app } = await appWith(
      network(() => new Response('# Gyde report\n', { headers: { 'content-type': 'text/plain' } })),
    );
    const res = await app.inject({
      method: 'GET',
      url: '/v1/analyses/analysis-0001/markdown',
      headers: withId(VALID_KEY),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe(MARKDOWN_TYPE);
    expect(res.body).toBe('# Gyde report\n');
  });
});

describe('404 and 400 (characterization)', () => {
  it.each(['/v1/analyses/nope', '/v1/analyses/nope/markdown'])(
    "turns Reports' 404 into the exact envelope for %s",
    async (url) => {
      const { app } = await appWith(
        network(() => json({ error: { code: 'not_found', message: 'schema reports' } }, 404)),
      );
      const res = await app.inject({ method: 'GET', url, headers: withId(VALID_KEY) });
      expect(res.statusCode).toBe(404);
      expect(res.headers['content-type']).toBe(JSON_TYPE);
      expect(res.json()).toEqual({
        error: { code: 'not_found', message: 'Analysis not found', requestId: REQUEST_ID },
      });
    },
  );

  it('answers the exact 400 envelope for an invalid body', async () => {
    const { app, toReports } = await appWith(network());
    const res = await app.inject({
      method: 'POST',
      url: '/v1/analyses',
      headers: withId(VALID_KEY),
      payload: { x: 1 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toBe(JSON_TYPE);
    const body = res.json();
    expect(body.error).toMatchObject({
      code: 'invalid_request',
      message: 'Request validation failed',
      requestId: REQUEST_ID,
    });
    expect(Array.isArray(body.error.details)).toBe(true);
    expect(body.error.details.length).toBeGreaterThan(0);
    expect(toReports()).toHaveLength(0);
  });
});
