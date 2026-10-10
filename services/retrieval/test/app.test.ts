import { type Entitlements, HEADERS, PLAN_CATALOG } from '@gyde/contracts';
import { sampleAnalysisRequest } from '@gyde/contracts/samples';
import { createLogger } from '@gyde/service-kit';
import { afterEach, describe, expect, it } from 'vitest';

import { BackgroundJobs } from '../src/application/background-jobs';
import { configSchema } from '../src/config';
import { createApp } from '../src/http/app';
import { FakeServices, HOSTS, fixtureKnowledge } from './support/fake-services';

const token = 'test-internal-token-123456';
const auth = { [HEADERS.internalToken]: token };

const config = configSchema.parse({
  INTERNAL_SERVICE_TOKEN: token,
  NORMALIZATION_URL: HOSTS.normalization,
  REPORTS_URL: HOSTS.reports,
  LLM_ANALYSIS_URL: HOSTS.llm,
});

const open: Awaited<ReturnType<typeof createApp>>[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((app) => app.close()));
});

/** A Retrieval wired to fake downstream services (the real HTTP adapters, breakers included). */
async function start(services = new FakeServices(token)) {
  const app = await createApp({
    config,
    logger: createLogger({ name: 'retrieval-test', level: 'silent' }),
    module: {
      fetch: services.fetch,
      sleep: async () => undefined,
      // Only the "5 failures in a row" rule opens a circuit in these tests: with the default
      // 50 % rule, the breaker of @gyde/resilience opens on the very first failure (no minimum
      // number of calls), which would hide what is being tested. See the PR notes for Area 1.
      breakerOverrides: { failureRate: 2 },
    },
  });
  open.push(app);
  const jobs = app.get(BackgroundJobs);

  const retrieve = async (
    entitlements: Entitlements,
    request = sampleAnalysisRequest,
    id = 'analysis-1',
  ) => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/retrieve',
      headers: auth,
      payload: { analysisId: id, tenantId: 'tenant-1', entitlements, request },
    });
    await jobs.idle();
    return res;
  };
  return { app, services, retrieve, jobs };
}

const pro = PLAN_CATALOG.pro;
const noAi = { ...sampleAnalysisRequest, options: { includeAi: false } };

describe('POST /internal/retrieve: the HTTP surface', () => {
  it('is alive and refuses /internal calls without the token', async () => {
    const { app } = await start();
    expect((await app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
    const res = await app.inject({ method: 'POST', url: '/internal/retrieve', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an invalid request with 400 and does nothing', async () => {
    const { app, services, jobs } = await start();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/retrieve',
      headers: auth,
      payload: { nope: true },
    });
    await jobs.idle();
    expect(res.statusCode).toBe(400);
    expect(services.calls).toEqual([]);
  });

  it('answers 202 at once and works in the background', async () => {
    const services = new FakeServices(token);
    let release!: () => void;
    services.reportsGate = new Promise<void>((resolve) => (release = resolve));
    const { app, jobs } = await start(services);

    const res = await app.inject({
      method: 'POST',
      url: '/internal/retrieve',
      headers: auth,
      payload: { analysisId: 'a1', tenantId: 't1', entitlements: pro, request: noAi },
    });

    expect(res.statusCode).toBe(202);
    expect(res.body).toBe('');
    // Reports is still being waited for: the answer did not depend on it.
    expect(services.deterministicResults).toEqual([]);
    release();
    await jobs.idle();
    expect(services.deterministicResults).toHaveLength(1);
  });
});

describe('the deterministic result (fixtures/README.md)', () => {
  it('publishes exactly the expected findings, and none for SAMPLE-0002 or SAMPLE-0003', async () => {
    const { services, retrieve } = await start();
    await retrieve(pro, noAi);

    const [result] = services.deterministicResults;
    expect(result?.analysisId).toBe('analysis-1');
    expect(result?.findings.map((f) => [f.kind, f.severity, f.title])).toEqual([
      ['vulnerability', 'high', 'Acme.Serialization 1.4.0 is affected by SAMPLE-0001'],
      [
        'license',
        'medium',
        'Acme.GplToolkit is GPL-3.0-only: review compatibility with proprietary distribution',
      ],
    ]);
    expect(result?.findings[0]).toMatchObject({ cvss: 7.5, deterministic: true });
    expect(JSON.stringify(result)).not.toMatch(/SAMPLE-0002|SAMPLE-0003/);
  });

  it('is ONE finding for Acme.Serialization although OSV and GHSA both describe it', async () => {
    const { services, retrieve } = await start();
    await retrieve(pro, noAi);

    const [vulnerability] = services.deterministicResults[0]!.findings;
    expect(vulnerability?.evidence.map((e) => e.knowledgeId).sort()).toEqual([
      'ghsa:GHSA-0000-0000-0001',
      'osv:SAMPLE-0001',
    ]);
  });

  it('carries the evidence of its findings and says what was covered', async () => {
    const { services, retrieve } = await start();
    await retrieve(pro, noAi);

    const [result] = services.deterministicResults;
    expect(result?.evidence).toEqual(result?.findings.flatMap((f) => f.evidence));
    // CompatibilityAnalyzer is not built yet: honest coverage, even on a plan that allows it.
    expect(result?.coverage).toEqual({
      vulnerabilities: true,
      licenses: true,
      compatibility: false,
    });
    expect(result?.partialSources).toBe(false);
  });

  it('is identical every time, whatever order the knowledge arrives in', async () => {
    const first = await start();
    await first.retrieve(pro, noAi);

    const second = await start();
    second.services.knowledge = [...fixtureKnowledge].reverse();
    await second.retrieve(pro, noAi);

    expect(second.services.deterministicResults).toEqual(first.services.deterministicResults);
  });

  it('asks normalization once, for each distinct package, and sends the internal token', async () => {
    const { services, retrieve } = await start();
    await retrieve(pro, noAi);

    const [query] = services.callsTo('normalization');
    expect(services.callsTo('normalization')).toHaveLength(1);
    expect(query?.path).toBe('/internal/knowledge/query');
    expect(query?.body).toMatchObject({ gameEngine: 'unity' });
    expect((query?.body as { packages: unknown[] }).packages).toHaveLength(3);
    for (const call of services.calls) expect(call.token, call.path).toBe(token);
  });
});

describe('plan gates', () => {
  it('runs the license analysis only when the plan has licenseCompliance', async () => {
    const withoutLicenses: Entitlements = {
      ...PLAN_CATALOG.free,
      features: { ...PLAN_CATALOG.free.features, licenseCompliance: false },
    };
    const { services, retrieve } = await start();
    await retrieve(withoutLicenses, noAi);

    const [result] = services.deterministicResults;
    expect(result?.findings.map((f) => f.kind)).toEqual(['vulnerability']);
    expect(result?.coverage.licenses).toBe(false);
  });

  it('the free plan gets vulnerabilities and licenses', async () => {
    const { services, retrieve } = await start();
    await retrieve(PLAN_CATALOG.free, noAi);

    expect(services.deterministicResults[0]?.coverage).toEqual({
      vulnerabilities: true,
      licenses: true,
      compatibility: false,
    });
  });
});

describe('dispatching to llm-analysis', () => {
  it('publishes the deterministic result BEFORE involving the LLM, then sends the same evidence', async () => {
    const { services, retrieve } = await start();
    await retrieve(pro);

    const order = services.calls.map((call) => call.service);
    expect(order.indexOf('reports')).toBeLessThan(order.indexOf('llm'));
    const [llm] = services.llmRequests;
    expect(llm).toMatchObject({ analysisId: 'analysis-1', tenantId: 'tenant-1' });
    expect(llm?.findings).toEqual(services.deterministicResults[0]?.findings);
    expect(llm?.project).toEqual(sampleAnalysisRequest.project);
    expect(services.failures).toEqual([]);
  });

  it('only when the plan allows AI AND the client asked for it', async () => {
    const { services, retrieve } = await start();
    await retrieve(pro, noAi, 'client-said-no');
    await retrieve(PLAN_CATALOG.free, sampleAnalysisRequest, 'plan-says-no');

    expect(services.llmRequests).toEqual([]);
    expect(services.deterministicResults).toHaveLength(2);
    expect(services.failures).toEqual([]);
  });

  it('publishes llm-unavailable when llm-analysis is down; the deterministic result still went out', async () => {
    const services = new FakeServices(token);
    services.behavior.llm = 'down';
    const { retrieve } = await start(services);
    await retrieve(pro);

    expect(services.deterministicResults).toHaveLength(1);
    expect(services.failures).toEqual([
      expect.objectContaining({
        analysisId: 'analysis-1',
        stage: 'llm',
        reason: 'llm-unavailable',
      }),
    ]);
  });

  it('publishes llm-unavailable when llm-analysis answers with a server error', async () => {
    const services = new FakeServices(token);
    services.behavior.llm = 'error500';
    const { retrieve } = await start(services);
    await retrieve(pro);

    expect(services.failures).toEqual([
      expect.objectContaining({ stage: 'llm', reason: 'llm-unavailable' }),
    ]);
  });

  it('publishes llm-unavailable without calling it once its circuit is open', async () => {
    const services = new FakeServices(token);
    services.behavior.llm = 'down';
    const { retrieve } = await start(services);

    for (let i = 0; i < 5; i++) await retrieve(pro, sampleAnalysisRequest, `a${i}`);
    expect(services.callsTo('llm')).toHaveLength(5);

    await retrieve(pro, sampleAnalysisRequest, 'after-open');
    expect(services.callsTo('llm')).toHaveLength(5); // the circuit answered, not the service
    expect(services.failures.at(-1)).toMatchObject({
      analysisId: 'after-open',
      stage: 'llm',
      reason: 'llm-unavailable',
    });
    // The deterministic part never depended on the AI.
    expect(services.deterministicResults).toHaveLength(6);
  });

  it('reports llm-error, not unavailable, when llm-analysis refuses the request', async () => {
    const services = new FakeServices(token);
    services.behavior.llm = 'reject400';
    const { retrieve } = await start(services);
    await retrieve(pro);

    expect(services.failures).toEqual([
      expect.objectContaining({ stage: 'llm', reason: 'llm-error' }),
    ]);
  });
});

describe('when normalization is degraded', () => {
  it('keeps working without knowledge and flags partialSources (the report is not degraded for it)', async () => {
    const services = new FakeServices(token);
    services.behavior.normalization = 'down';
    const { retrieve } = await start(services);
    await retrieve(pro, noAi);

    const [result] = services.deterministicResults;
    expect(result?.partialSources).toBe(true);
    // Licenses need no knowledge, so they are still found.
    expect(result?.findings.map((f) => f.kind)).toEqual(['license']);
    expect(services.failures).toEqual([]);
  });

  it('serves the last known knowledge while it is down, still flagged partial', async () => {
    const services = new FakeServices(token);
    const { retrieve } = await start(services);
    await retrieve(pro, noAi, 'fresh');

    services.behavior.normalization = 'down';
    await retrieve(pro, noAi, 'stale');

    const [fresh, stale] = services.deterministicResults;
    expect(stale?.findings).toEqual(fresh?.findings);
    expect(fresh?.partialSources).toBe(false);
    expect(stale?.partialSources).toBe(true);
  });

  it('stops calling it once its circuit is open', async () => {
    const services = new FakeServices(token);
    services.behavior.normalization = 'error500';
    const { retrieve } = await start(services);

    for (let i = 0; i < 5; i++) await retrieve(pro, noAi, `a${i}`);
    await retrieve(pro, noAi, 'after-open');

    expect(services.callsTo('normalization')).toHaveLength(5);
    expect(services.deterministicResults).toHaveLength(6);
    expect(services.deterministicResults.every((r) => r.partialSources)).toBe(true);
  });
});

describe('when Retrieval itself fails', () => {
  it('publishes retrieval-error when normalization refuses the query (a bug, not an outage)', async () => {
    const services = new FakeServices(token);
    services.behavior.normalization = 'reject400';
    const { retrieve } = await start(services);
    await retrieve(pro, noAi);

    expect(services.deterministicResults).toEqual([]);
    expect(services.failures).toEqual([
      expect.objectContaining({
        analysisId: 'analysis-1',
        stage: 'retrieval',
        reason: 'retrieval-error',
      }),
    ]);
  });

  it('publishes retrieval-error when normalization answers something that is not a result', async () => {
    const services = new FakeServices(token);
    services.behavior.normalization = 'garbage';
    const { retrieve } = await start(services);
    await retrieve(pro, noAi);

    expect(services.deterministicResults).toEqual([]);
    expect(services.failures).toEqual([expect.objectContaining({ reason: 'retrieval-error' })]);
  });

  it('retries a short Reports outage, so the result is not lost', async () => {
    const services = new FakeServices(token);
    services.failNext.reports = 2;
    const { retrieve } = await start(services);
    await retrieve(pro, noAi);

    expect(services.callsTo('reports')).toHaveLength(3);
    expect(services.deterministicResults).toHaveLength(1);
    expect(services.failures).toEqual([]);
  });

  it('survives a Reports that never answers: it gives up quietly and stays alive', async () => {
    const services = new FakeServices(token);
    services.behavior.reports = 'down';
    const { app, retrieve } = await start(services);
    const res = await retrieve(pro, noAi);

    expect(res.statusCode).toBe(202);
    // 3 attempts for the result and 3 for the failure notice, but after 5 failures in a row the
    // circuit opens and the sixth attempt is answered by the breaker, not by Reports.
    expect(services.callsTo('reports')).toHaveLength(5);
    expect((await app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
  });

  it('never lets the error text of a downstream service reach the failure message', async () => {
    const services = new FakeServices(token);
    services.behavior.normalization = 'reject400';
    const { retrieve } = await start(services);
    await retrieve(pro, noAi);

    expect(services.failures[0]?.message).toBe(
      'Retrieval could not complete the deterministic analysis.',
    );
  });
});
