import { HEADERS, PLAN_CATALOG } from '@gyde/contracts';
import {
  sampleAnalysisRequest,
  sampleEntitlementsPro,
  sampleReportReady,
} from '@gyde/contracts/samples';
import { afterEach, describe, expect, it } from 'vitest';

import {
  INTERNAL_TOKEN,
  REVOKED_KEY,
  VALID_KEY,
  bearer,
  fakeFetch,
  json,
  makeApp,
  webAnswer,
  type RecordedCall,
} from './helpers';

const apps: { close(): Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function appWith(handler: (call: RecordedCall) => Response | Promise<Response>, o = {}) {
  const network = fakeFetch(handler);
  const app = await makeApp({ fetch: network.fn, ...o });
  apps.push(app);
  return { app, calls: network.calls };
}

const webOnly = (call: RecordedCall) => webAnswer(call);

describe('gateway skeleton', () => {
  it('is alive without an API key', async () => {
    const { app } = await appWith(webOnly);
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ service: 'gateway' });
  });

  it('never serves /internal routes (they are service-to-service only)', async () => {
    const { app } = await appWith(webOnly);
    const res = await app.inject({
      method: 'GET',
      url: '/internal/analyses/anything',
      headers: { ...bearer(VALID_KEY), [HEADERS.internalToken]: INTERNAL_TOKEN },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('authentication (Web introspection)', () => {
  it('rejects a missing, malformed or unknown API key with 401', async () => {
    const { app, calls } = await appWith(webOnly);

    const missing = await app.inject({ method: 'GET', url: '/v1/auth/verify' });
    const wrongScheme = await app.inject({
      method: 'GET',
      url: '/v1/auth/verify',
      headers: { authorization: `Basic ${VALID_KEY}` },
    });
    const unknown = await app.inject({
      method: 'GET',
      url: '/v1/auth/verify',
      headers: bearer('gyde_test_unknown_key_000000'),
    });

    for (const res of [missing, wrongScheme, unknown]) {
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: { code: 'unauthorized' } });
    }
    // Only the well-formed key reached Web.
    expect(calls).toHaveLength(1);
  });

  it('refuses a key outside the contract bounds without calling Web', async () => {
    const { app, calls } = await appWith(webOnly);
    const res = await app.inject({
      method: 'GET',
      url: '/v1/auth/verify',
      headers: bearer('short'),
    });
    expect(res.statusCode).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('answers 401 for a revoked key, with the same message as an unknown one', async () => {
    const { app } = await appWith(webOnly);
    const revoked = await app.inject({
      method: 'GET',
      url: '/v1/auth/verify',
      headers: bearer(REVOKED_KEY),
    });
    expect(revoked.statusCode).toBe(401);
    expect(revoked.json().error.message).toBe('Missing or invalid API key');
  });

  it('GET /v1/auth/verify returns the entitlements Web returned, not a recomputation', async () => {
    const custom = { ...PLAN_CATALOG.pro, limits: { analysesPerMonth: 7, projects: 3 } };
    const { app, calls } = await appWith(() =>
      json({ valid: true, tenantId: 't-9', apiKeyId: 'k-9', entitlements: custom }),
    );

    const res = await app.inject({
      method: 'GET',
      url: '/v1/auth/verify',
      headers: bearer(VALID_KEY),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ plan: 'pro', entitlements: custom });
    expect(calls[0]?.url).toBe('http://web.test/internal/api-keys/verify');
    expect(calls[0]?.headers.get(HEADERS.internalToken)).toBe(INTERNAL_TOKEN);
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({ apiKey: VALID_KEY });
  });

  it('caches a verified key briefly and asks Web again once the entry expires', async () => {
    let now = 1_000_000;
    let valid = true;
    const { app, calls } = await appWith(
      (call) => (valid ? webAnswer(call) : json({ valid: false, reason: 'revoked' })),
      { now: () => now },
    );
    const verify = () =>
      app.inject({ method: 'GET', url: '/v1/auth/verify', headers: bearer(VALID_KEY) });

    expect((await verify()).statusCode).toBe(200);
    expect((await verify()).statusCode).toBe(200);
    expect(calls).toHaveLength(1);

    // The key is revoked in Web: it keeps working until the cache entry expires (accepted).
    valid = false;
    now += 30_000;
    expect((await verify()).statusCode).toBe(200);
    expect(calls).toHaveLength(1);

    now += 31_000;
    expect((await verify()).statusCode).toBe(401);
    expect(calls).toHaveLength(2);
  });

  it('does not cache a rejection: a key that becomes valid works at once', async () => {
    let valid = false;
    const { app, calls } = await appWith((call) =>
      valid ? webAnswer(call) : json({ valid: false, reason: 'unknown' }),
    );
    const verify = () =>
      app.inject({ method: 'GET', url: '/v1/auth/verify', headers: bearer(VALID_KEY) });

    expect((await verify()).statusCode).toBe(401);
    valid = true;
    expect((await verify()).statusCode).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it('answers 503 upstream_unavailable when Web fails, without leaking its answer', async () => {
    const { app } = await appWith(() => new Response('db password is hunter2', { status: 500 }));
    const res = await app.inject({
      method: 'GET',
      url: '/v1/auth/verify',
      headers: bearer(VALID_KEY),
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: { code: 'upstream_unavailable' } });
    expect(res.body).not.toContain('hunter2');
    expect(res.body).not.toContain('web');
  });

  it('never writes the API key or the Authorization header to the logs', async () => {
    const lines: string[] = [];
    const { app } = await appWith(webOnly, {
      logDestination: { write: (c: string) => lines.push(c) },
    });

    await app.inject({ method: 'GET', url: '/v1/auth/verify', headers: bearer(VALID_KEY) });
    await app.inject({ method: 'GET', url: '/v1/auth/verify', headers: bearer(REVOKED_KEY) });

    expect(lines.length).toBeGreaterThan(0);
    const output = lines.join('');
    expect(output).not.toContain(VALID_KEY);
    expect(output).not.toContain(REVOKED_KEY);
  });
});

/** A Web + Reports network: every test overrides only what it needs. */
function network(reports: (call: RecordedCall) => Response | Promise<Response>) {
  return (call: RecordedCall) =>
    call.url.startsWith('http://web.test') ? webAnswer(call) : reports(call);
}

describe('POST /v1/analyses', () => {
  it('answers 202 with the analysisId created by Reports, forwarding the tenant job', async () => {
    const accepted = { analysisId: 'analysis-42', status: 'pending' };
    const { app, calls } = await appWith(network(() => json(accepted, 202)));

    const res = await app.inject({
      method: 'POST',
      url: '/v1/analyses',
      headers: { ...bearer(VALID_KEY), 'x-request-id': 'req-abc' },
      payload: sampleAnalysisRequest,
    });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual(accepted);
    expect(res.headers['x-request-id']).toBe('req-abc');

    const toReports = calls.find((c) => c.url.startsWith('http://reports.test'))!;
    expect(toReports.method).toBe('POST');
    expect(toReports.url).toBe('http://reports.test/internal/analyses');
    expect(JSON.parse(toReports.body ?? '{}')).toEqual({
      tenantId: 'tenant-1',
      entitlements: sampleEntitlementsPro,
      request: sampleAnalysisRequest,
    });
    expect(toReports.headers.get(HEADERS.requestId)).toBe('req-abc');
    expect(toReports.headers.get(HEADERS.tenantId)).toBe('tenant-1');
    expect(toReports.headers.get(HEADERS.internalToken)).toBe(INTERNAL_TOKEN);
  });

  it('propagates x-request-id and x-gyde-tenant-id to Web too, and makes an id when absent', async () => {
    const { app, calls } = await appWith(
      network(() => json({ analysisId: 'a', status: 'pending' }, 202)),
    );

    await app.inject({
      method: 'POST',
      url: '/v1/analyses',
      headers: bearer(VALID_KEY),
      payload: sampleAnalysisRequest,
    });

    const toWeb = calls.find((c) => c.url.startsWith('http://web.test'))!;
    const toReports = calls.find((c) => c.url.startsWith('http://reports.test'))!;
    expect(toWeb.headers.get(HEADERS.requestId)).toBeTruthy();
    expect(toReports.headers.get(HEADERS.requestId)).toBe(toWeb.headers.get(HEADERS.requestId));
  });

  it('needs a key (401) and validates the body (400) before calling Reports', async () => {
    const { app, calls } = await appWith(network(() => json({}, 202)));

    const noKey = await app.inject({
      method: 'POST',
      url: '/v1/analyses',
      payload: sampleAnalysisRequest,
    });
    const badBody = await app.inject({
      method: 'POST',
      url: '/v1/analyses',
      headers: bearer(VALID_KEY),
      payload: { x: 1 },
    });

    expect(noKey.statusCode).toBe(401);
    expect(badBody.statusCode).toBe(400);
    expect(calls.some((c) => c.url.startsWith('http://reports.test'))).toBe(false);
  });

  it('answers 503 upstream_unavailable (never hangs) when no instance can be resolved', async () => {
    const { app } = await appWith(webOnly, { withUrls: false });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/analyses',
      headers: bearer(VALID_KEY),
      payload: sampleAnalysisRequest,
    });
    // Web cannot be resolved either, so authentication already fails as unavailable.
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: { code: 'upstream_unavailable' } });
  });

  it('answers 503 when Reports is unreachable or fails, without leaking details', async () => {
    const unreachable = await appWith(
      network(() => {
        throw new TypeError('fetch failed: ECONNREFUSED reports:4500');
      }),
    );
    const failing = await appWith(
      network(() => new Response('stack: /srv/app.js', { status: 500 })),
    );

    for (const { app } of [unreachable, failing]) {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/analyses',
        headers: bearer(VALID_KEY),
        payload: sampleAnalysisRequest,
      });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toMatchObject({ error: { code: 'upstream_unavailable' } });
      expect(res.body).not.toMatch(/ECONNREFUSED|app\.js|reports/);
    }
  });
});

describe('GET /v1/analyses/:id', () => {
  it('returns the Report validated with the contract schema', async () => {
    const { app, calls } = await appWith(network(() => json(sampleReportReady)));

    const res = await app.inject({
      method: 'GET',
      url: '/v1/analyses/analysis-0001',
      headers: { ...bearer(VALID_KEY), 'x-request-id': 'req-get' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(sampleReportReady);
    const toReports = calls.find((c) => c.url.startsWith('http://reports.test'))!;
    expect(toReports.url).toBe('http://reports.test/internal/analyses/analysis-0001');
    expect(toReports.headers.get(HEADERS.requestId)).toBe('req-get');
    expect(toReports.headers.get(HEADERS.tenantId)).toBe('tenant-1');
  });

  it("propagates Reports' 404 for an analysis that does not exist", async () => {
    const { app } = await appWith(
      network(() =>
        json({ error: { code: 'not_found', message: 'Analysis x in schema reports' } }, 404),
      ),
    );
    const res = await app.inject({
      method: 'GET',
      url: '/v1/analyses/nope',
      headers: bearer(VALID_KEY),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      error: { code: 'not_found', message: 'Analysis not found' },
    });
    expect(res.body).not.toContain('schema reports');
  });

  it('answers 503 instead of passing on a body that is not a Report', async () => {
    const { app } = await appWith(network(() => json({ hello: 'world' })));
    const res = await app.inject({
      method: 'GET',
      url: '/v1/analyses/analysis-0001',
      headers: bearer(VALID_KEY),
    });
    expect(res.statusCode).toBe(503);
  });

  it('cannot be tricked into another Reports route through the id', async () => {
    const { app, calls } = await appWith(network(() => json(sampleReportReady)));
    await app.inject({
      method: 'GET',
      url: '/v1/analyses/x%2Fdeterministic',
      headers: bearer(VALID_KEY),
    });
    const toReports = calls.find((c) => c.url.startsWith('http://reports.test'))!;
    expect(toReports.url).toBe('http://reports.test/internal/analyses/x%2Fdeterministic');
  });

  it('needs an API key', async () => {
    const { app } = await appWith(network(() => json(sampleReportReady)));
    const res = await app.inject({ method: 'GET', url: '/v1/analyses/analysis-0001' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /v1/analyses/:id/markdown', () => {
  it('returns the Markdown of Reports as text/markdown', async () => {
    const { app } = await appWith(
      network(
        () => new Response('# Gyde report\n', { headers: { 'content-type': 'text/markdown' } }),
      ),
    );
    const res = await app.inject({
      method: 'GET',
      url: '/v1/analyses/analysis-0001/markdown',
      headers: bearer(VALID_KEY),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    expect(res.body).toBe('# Gyde report\n');
  });

  it("propagates Reports' 404 with the JSON error envelope", async () => {
    const { app } = await appWith(network(() => json({ error: { code: 'not_found' } }, 404)));
    const res = await app.inject({
      method: 'GET',
      url: '/v1/analyses/nope/markdown',
      headers: bearer(VALID_KEY),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'not_found' } });
  });
});
