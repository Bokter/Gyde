/**
 * Characterization of the externally observable behavior of the reports service, written BEFORE
 * the clean-architecture refactor and kept unchanged by it. Everything here goes through HTTP
 * (`app.inject`) and the existing seams (`repository`, `retrieval`, `schedule`, `logger`, `now`,
 * `newId`), so it survives moving the code between layers.
 *
 * It describes what the service does TODAY, including behaviors that look odd (see the
 * "known behaviors" block at the end): it fixes them, it does not judge them.
 */
import {
  type AiResult,
  type CreateAnalysisJob,
  HEADERS,
  PLAN_CATALOG,
  Report,
  type RetrieveRequest,
} from '@gyde/contracts';
import {
  sampleAnalysisRequest,
  sampleLicenseFinding,
  sampleVulnerabilityFinding,
} from '@gyde/contracts/samples';
import { createLogger } from '@gyde/service-kit';
import type { NestFastifyApplication } from '@gyde/service-kit';
import { Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppModuleOverrides } from '../src/app.module';
import type { TimerName } from '../src/application/analysis-watchdog';
import { configSchema } from '../src/config';
import type { DatabaseHandle } from '../src/infrastructure/db/database';
import { Analysis } from '../src/domain/entities/analysis.entity';
import { InMemoryReportRepository } from '../src/infrastructure/in-memory-report-repository';
import { PostgresReportRepository } from '../src/infrastructure/postgres-report.repository';
import { createApp } from '../src/http/app';
import { FakeRepository, FakeRetrieval } from './support/fakes';
import { createPgliteDatabase } from './support/pglite';
import { viaSnapshots } from './support/snapshots';

const token = 'test-internal-token-123456';
const config = configSchema.parse({ INTERNAL_SERVICE_TOKEN: token });
const auth = { [HEADERS.internalToken]: token };
const asTenant = (tenantId: string) => ({ ...auth, [HEADERS.tenantId]: tenantId });

const NOW_ISO = '2026-10-18T12:00:00.000Z';
const NOW = new Date(NOW_ISO);

const apps: NestFastifyApplication[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function buildApp(
  overrides: AppModuleOverrides = {},
  database?: DatabaseHandle,
): Promise<NestFastifyApplication> {
  const app = await createApp({
    config,
    logger: createLogger({ name: 'reports-test', level: 'silent' }),
    database,
    overrides: { now: () => NOW, ...overrides },
  });
  apps.push(app);
  return app;
}

/** Ids `analysis-1`, `analysis-2`... so the bodies can be compared exactly. */
function sequentialIds(): () => string {
  let n = 0;
  return () => `analysis-${++n}`;
}

/** Captures the watchdogs instead of arming real timers. */
function timers() {
  const armed: { timer?: TimerName; ms: number; fn: () => void }[] = [];
  const schedule = (fn: () => void, ms: number, timer?: TimerName) => {
    armed.push({ timer, ms, fn });
  };
  const of = (timer: TimerName) => armed.filter((entry) => entry.timer === timer);
  const fire = async (timer: TimerName) => {
    const result: unknown = of(timer)[0]?.fn();
    await result;
  };
  return { armed, schedule, of, fire };
}

function job(
  options: { plan?: keyof typeof PLAN_CATALOG; includeAi?: boolean; tenantId?: string } = {},
): CreateAnalysisJob {
  return {
    tenantId: options.tenantId ?? 'tenant-1',
    entitlements: PLAN_CATALOG[options.plan ?? 'pro'],
    request: {
      ...sampleAnalysisRequest,
      options: { includeAi: options.includeAi ?? true },
    },
  };
}

const vulnerability = { ...sampleVulnerabilityFinding };
const license = { ...sampleLicenseFinding };

function deterministicBody(analysisId: string, findings = [vulnerability, license]) {
  return {
    analysisId,
    findings,
    evidence: [],
    coverage: { vulnerabilities: true, compatibility: true, licenses: true },
    partialSources: false,
  };
}

function aiBody(analysisId: string): AiResult {
  return {
    analysisId,
    findings: [{ ...vulnerability, aiExplanation: 'Explained by the model.' }],
    summary: 'Short summary.',
  };
}

function failureBody(
  analysisId: string,
  stage: 'llm' | 'retrieval',
  reason: 'retrieval-error' | 'llm-unavailable' | 'llm-not-configured' | 'llm-error',
  message = 'boom',
) {
  return { analysisId, stage, reason, message };
}

interface Scenario {
  app: NestFastifyApplication;
  repo: FakeRepository;
  retrieval: FakeRetrieval;
  armed: ReturnType<typeof timers>;
  id: string;
  post: (
    path: string,
    payload: object,
    id?: string,
  ) => ReturnType<NestFastifyApplication['inject']>;
  get: (suffix?: string, tenantId?: string) => ReturnType<NestFastifyApplication['inject']>;
  report: () => Promise<Report>;
  state: () => FakeRepository['store'] extends Map<string, infer V> ? V | undefined : never;
}

/** Creates one analysis (`analysis-1`) and returns handles to drive and inspect it. */
async function start(
  options: {
    plan?: keyof typeof PLAN_CATALOG;
    includeAi?: boolean;
    retrieval?: FakeRetrieval;
  } = {},
): Promise<Scenario> {
  const repo = new FakeRepository();
  const retrieval = options.retrieval ?? new FakeRetrieval();
  const armed = timers();
  const app = await buildApp({
    repository: repo,
    retrieval,
    schedule: armed.schedule,
    newId: sequentialIds(),
  });
  const res = await app.inject({
    method: 'POST',
    url: '/internal/analyses',
    headers: auth,
    payload: job(options),
  });
  const id = (res.json() as { analysisId: string }).analysisId;
  const post = (path: string, payload: object, target = id) =>
    app.inject({
      method: 'POST',
      url: `/internal/analyses/${target}/${path}`,
      headers: auth,
      payload,
    });
  const get = (suffix = '', tenantId = 'tenant-1') =>
    app.inject({
      method: 'GET',
      url: `/internal/analyses/${id}${suffix}`,
      headers: asTenant(tenantId),
    });
  return {
    app,
    repo,
    retrieval,
    armed,
    id,
    post,
    get,
    report: async () => Report.parse((await get()).json()),
    state: () => repo.store.get(id),
  };
}

describe('POST /internal/analyses (create)', () => {
  it('answers 202 with exactly {analysisId, status} and stores the job as retrieving', async () => {
    const s = await start();

    const res = await s.app.inject({
      method: 'POST',
      url: '/internal/analyses',
      headers: auth,
      payload: job(),
    });
    expect(res.statusCode).toBe(202);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(res.body).toBe('{"analysisId":"analysis-2","status":"retrieving"}');

    expect(s.repo.store.get('analysis-2')).toEqual({
      id: 'analysis-2',
      tenantId: 'tenant-1',
      entitlements: PLAN_CATALOG.pro,
      aiExpected: true,
      status: 'retrieving',
      createdAt: NOW_ISO,
    });
  });

  it('forwards the whole request to Retrieval and arms the retrieval watchdog only', async () => {
    const s = await start();

    const expected: RetrieveRequest = {
      analysisId: s.id,
      tenantId: 'tenant-1',
      entitlements: PLAN_CATALOG.pro,
      request: job().request,
    };
    expect(s.retrieval.requests).toEqual([expected]);
    expect(s.armed.armed).toHaveLength(1);
    expect(s.armed.of('retrieval')).toHaveLength(1);
    expect(s.armed.of('retrieval')[0]?.ms).toBe(config.REPORTS_RETRIEVAL_TIMEOUT_MS);
    expect(s.armed.of('ai')).toHaveLength(0);
  });

  it.each([
    { name: 'pro plan asking for AI', plan: 'pro', includeAi: true, expected: true },
    { name: 'pro plan not asking for AI', plan: 'pro', includeAi: false, expected: false },
    { name: 'free plan asking for AI', plan: 'free', includeAi: true, expected: false },
    { name: 'studio plan asking for AI', plan: 'studio', includeAi: true, expected: true },
  ] as const)('aiExpected is $expected for $name', async ({ plan, includeAi, expected }) => {
    const s = await start({ plan, includeAi });
    expect(s.state()?.aiExpected).toBe(expected);
  });

  it('keeps answering 202 "retrieving" when Retrieval throws, while the job is failed (the Error message is kept)', async () => {
    const retrieval = new FakeRetrieval();
    retrieval.failWith = new Error('Retrieval is down');
    const s = await start({ retrieval });

    // The job exists and is failed...
    expect(s.state()).toEqual({
      id: 'analysis-1',
      tenantId: 'tenant-1',
      entitlements: PLAN_CATALOG.pro,
      aiExpected: true,
      status: 'failed',
      createdAt: NOW_ISO,
      completedAt: NOW_ISO,
      failure: {
        analysisId: 'analysis-1',
        stage: 'retrieval',
        reason: 'retrieval-error',
        message: 'Retrieval is down',
      },
    });
    // ...no watchdog is armed...
    expect(s.armed.armed).toHaveLength(0);
    // ...and the report says so.
    const report = await s.report();
    expect(report.status).toBe('failed');
    expect(report.error).toEqual({ code: 'internal', message: 'Retrieval is down' });

    // The response to a create whose Retrieval call fails still says "retrieving".
    const res = await s.app.inject({
      method: 'POST',
      url: '/internal/analyses',
      headers: auth,
      payload: job(),
    });
    expect(res.statusCode).toBe(202);
    expect(res.body).toBe('{"analysisId":"analysis-2","status":"retrieving"}');
  });

  it('uses "Retrieval is unavailable" when what Retrieval throws is not an Error', async () => {
    const retrieval = new FakeRetrieval();
    retrieval.retrieve = async () => {
      throw 'plain string';
    };
    const s = await start({ retrieval });
    expect(s.state()?.failure?.message).toBe('Retrieval is unavailable');
  });

  it('answers 500 and never calls Retrieval when the repository cannot create the job', async () => {
    const repo = new FakeRepository();
    repo.create = async () => {
      throw new Error('db is down');
    };
    const retrieval = new FakeRetrieval();
    const app = await buildApp({ repository: repo, retrieval });

    const res = await app.inject({
      method: 'POST',
      url: '/internal/analyses',
      headers: auth,
      payload: job(),
    });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ error: { code: 'internal' } });
    expect(retrieval.requests).toHaveLength(0);
  });
});

describe('request validation (400 before any use case runs)', () => {
  const invalid = [
    { name: 'create', path: '/internal/analyses', payload: { nope: true } },
    {
      name: 'deterministic',
      path: '/internal/analyses/a-1/deterministic',
      payload: { ...deterministicBody('a-1'), extra: 1 },
    },
    {
      name: 'ai-result',
      path: '/internal/analyses/a-1/ai-result',
      payload: { ...aiBody('a-1'), extra: 1 },
    },
    {
      name: 'failure',
      path: '/internal/analyses/a-1/failure',
      payload: { ...failureBody('a-1', 'llm', 'llm-error'), extra: 1 },
    },
  ];

  it.each(invalid)('answers 400 invalid_request on $name and touches nothing', async (c) => {
    const repo = new FakeRepository();
    const retrieval = new FakeRetrieval();
    const app = await buildApp({ repository: repo, retrieval });

    const res = await app.inject({
      method: 'POST',
      url: c.path,
      headers: auth,
      payload: c.payload,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'invalid_request' } });
    expect(repo.calls).toEqual([]);
    expect(retrieval.requests).toEqual([]);
  });

  it('fills partialSources with false when the body omits it', async () => {
    const s = await start();
    const { partialSources: _omitted, ...body } = deterministicBody(s.id);
    const res = await s.post('deterministic', body);
    expect(res.statusCode).toBe(204);
    expect(s.state()?.deterministic?.partialSources).toBe(false);
  });
});

describe('result endpoints', () => {
  it('answer 204 with no body and no content-type', async () => {
    const s = await start();
    const res = await s.post('deterministic', deterministicBody(s.id));
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    expect(res.headers['content-type']).toBeUndefined();
  });

  it('take the analysis id from the path, never from the body', async () => {
    const s = await start();
    const other = await s.app.inject({
      method: 'POST',
      url: '/internal/analyses',
      headers: auth,
      payload: job(),
    });
    const otherId = (other.json() as { analysisId: string }).analysisId;
    const otherBefore = structuredClone(s.repo.store.get(otherId));

    // Body claims the other analysis; the path says analysis-1.
    expect((await s.post('deterministic', deterministicBody(otherId))).statusCode).toBe(204);

    expect(s.state()?.status).toBe('analyzing');
    expect(s.state()?.deterministic?.analysisId).toBe(s.id);
    expect(s.repo.store.get(otherId)).toEqual(otherBefore);

    // Same for the AI result and for the failure.
    await s.post('ai-result', aiBody(otherId));
    expect(s.state()?.ai?.analysisId).toBe(s.id);
    expect(s.repo.store.get(otherId)).toEqual(otherBefore);

    const failing = await start();
    await failing.post('failure', failureBody(otherId, 'retrieval', 'retrieval-error'));
    expect(failing.state()?.failure?.analysisId).toBe(failing.id);
  });

  it('answer the same 404 envelope for a missing analysis on every endpoint', async () => {
    const repo = new FakeRepository();
    const app = await buildApp({ repository: repo, retrieval: new FakeRetrieval() });
    const calls = [
      app.inject({ method: 'GET', url: '/internal/analyses/ghost', headers: asTenant('t') }),
      app.inject({
        method: 'GET',
        url: '/internal/analyses/ghost/markdown',
        headers: asTenant('t'),
      }),
      app.inject({
        method: 'POST',
        url: '/internal/analyses/ghost/deterministic',
        headers: auth,
        payload: deterministicBody('ghost'),
      }),
      app.inject({
        method: 'POST',
        url: '/internal/analyses/ghost/ai-result',
        headers: auth,
        payload: aiBody('ghost'),
      }),
      app.inject({
        method: 'POST',
        url: '/internal/analyses/ghost/failure',
        headers: auth,
        payload: failureBody('ghost', 'llm', 'llm-error'),
      }),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.statusCode).toBe(404);
      expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
      const body = res.json() as { error: Record<string, unknown> };
      expect(Object.keys(body)).toEqual(['error']);
      expect(body.error).toMatchObject({
        code: 'not_found',
        message: 'Analysis ghost was not found',
      });
    }
    expect([...repo.store.keys()]).toEqual([]);
  });

  it('answer a foreign tenant exactly like a missing id, with the id in the message', async () => {
    const s = await start();
    const foreign = await s.get('', 'tenant-2');
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toMatchObject({
      error: { code: 'not_found', message: `Analysis ${s.id} was not found` },
    });
  });
});

describe('state machine: valid transitions', () => {
  it('deterministic + AI expected: retrieving -> analyzing, stores the result and arms the AI watchdog', async () => {
    const s = await start();
    await s.post('deterministic', deterministicBody(s.id));

    expect(s.state()).toEqual({
      id: s.id,
      tenantId: 'tenant-1',
      entitlements: PLAN_CATALOG.pro,
      aiExpected: true,
      status: 'analyzing',
      createdAt: NOW_ISO,
      deterministic: deterministicBody(s.id),
    });
    expect(s.armed.of('ai')).toHaveLength(1);
    expect(s.armed.of('ai')[0]?.ms).toBe(config.REPORTS_AI_TIMEOUT_MS);
  });

  it('deterministic + AI not expected: retrieving -> ready with completedAt, no AI watchdog', async () => {
    const s = await start({ plan: 'free' });
    await s.post('deterministic', deterministicBody(s.id));

    expect(s.state()?.status).toBe('ready');
    expect(s.state()?.completedAt).toBe(NOW_ISO);
    expect(s.armed.of('ai')).toHaveLength(0);
  });

  it('AI result after the deterministic one: analyzing -> ready, with completedAt', async () => {
    const s = await start();
    await s.post('deterministic', deterministicBody(s.id));
    await s.post('ai-result', aiBody(s.id));

    expect(s.state()?.status).toBe('ready');
    expect(s.state()?.completedAt).toBe(NOW_ISO);
    expect(s.state()?.ai).toEqual(aiBody(s.id));
  });

  it('AI result first (AI expected): it is kept and the deterministic one then closes the job without an AI watchdog', async () => {
    const s = await start();
    await s.post('ai-result', aiBody(s.id));
    expect(s.state()?.status).toBe('retrieving');
    expect(s.state()?.ai).toEqual(aiBody(s.id));
    expect(s.state()?.completedAt).toBeUndefined();

    await s.post('deterministic', deterministicBody(s.id));
    expect(s.state()?.status).toBe('ready');
    expect(s.state()?.completedAt).toBe(NOW_ISO);
    expect(s.armed.of('ai')).toHaveLength(0);
  });

  it('a second AI result before the deterministic one replaces the first', async () => {
    const s = await start();
    await s.post('ai-result', aiBody(s.id));
    await s.post('ai-result', { ...aiBody(s.id), summary: 'Second.' });
    expect(s.state()?.ai?.summary).toBe('Second.');
    expect(s.state()?.status).toBe('retrieving');
  });

  it('llm failure while analyzing: ready with the failure stored as received', async () => {
    const s = await start();
    await s.post('deterministic', deterministicBody(s.id));
    await s.post('failure', failureBody(s.id, 'llm', 'llm-not-configured', 'No key'));

    expect(s.state()?.status).toBe('ready');
    expect(s.state()?.completedAt).toBe(NOW_ISO);
    expect(s.state()?.failure).toEqual(failureBody(s.id, 'llm', 'llm-not-configured', 'No key'));
  });

  it.each(['retrieving', 'analyzing'] as const)(
    'retrieval failure while %s: failed with the failure stored as received',
    async (from) => {
      const s = await start();
      if (from === 'analyzing') await s.post('deterministic', deterministicBody(s.id));
      await s.post('failure', failureBody(s.id, 'retrieval', 'retrieval-error', 'No evidence'));

      expect(s.state()?.status).toBe('failed');
      expect(s.state()?.completedAt).toBe(NOW_ISO);
      expect(s.state()?.failure).toEqual(
        failureBody(s.id, 'retrieval', 'retrieval-error', 'No evidence'),
      );
    },
  );

  it('retrieval failure after the deterministic result keeps its findings in the failed report', async () => {
    const s = await start();
    await s.post('deterministic', deterministicBody(s.id));
    await s.post('failure', failureBody(s.id, 'retrieval', 'retrieval-error', 'No evidence'));

    const report = await s.report();
    expect(report.status).toBe('failed');
    expect(report.degraded).toBe(false);
    expect(report.error).toEqual({ code: 'internal', message: 'No evidence' });
    expect(report.findings.map((f) => f.id)).toEqual([vulnerability.id, license.id]);
  });
});

describe('state machine: ignored deliveries do not write', () => {
  /** Drives a job to each final state and returns it plus what the repository has seen. */
  async function inState(state: 'analyzing' | 'ready' | 'failed') {
    const s = await start();
    if (state === 'analyzing') await s.post('deterministic', deterministicBody(s.id));
    if (state === 'ready') {
      await s.post('deterministic', deterministicBody(s.id));
      await s.post('ai-result', aiBody(s.id));
    }
    if (state === 'failed') {
      await s.post('failure', failureBody(s.id, 'retrieval', 'retrieval-error', 'first'));
    }
    return s;
  }

  async function expectNoWrite(s: Scenario, path: string, payload: object) {
    const before = structuredClone(s.state());
    const callsBefore = [...s.repo.calls];
    const res = await s.post(path, payload);
    expect(res.statusCode).toBe(204);
    expect(s.state()).toEqual(before);
    expect(s.repo.calls.slice(callsBefore.length)).toEqual([`get:${s.id}`]);
  }

  it.each(['analyzing', 'ready', 'failed'] as const)(
    'a deterministic result while %s is ignored',
    async (state) => {
      const s = await inState(state);
      await expectNoWrite(s, 'deterministic', {
        ...deterministicBody(s.id, []),
        partialSources: true,
      });
    },
  );

  it.each(['ready', 'failed'] as const)('an AI result while %s is ignored', async (state) => {
    const s = await inState(state);
    await expectNoWrite(s, 'ai-result', { ...aiBody(s.id), summary: 'late' });
  });

  it.each(['ready', 'failed'] as const)('any failure while %s is ignored', async (state) => {
    const s = await inState(state);
    await expectNoWrite(s, 'failure', failureBody(s.id, 'retrieval', 'retrieval-error', 'late'));
    await expectNoWrite(s, 'failure', failureBody(s.id, 'llm', 'llm-error', 'late'));
  });

  it('an llm failure is ignored when AI was not expected, in any state', async () => {
    const s = await start({ plan: 'free' });
    await expectNoWrite(s, 'failure', failureBody(s.id, 'llm', 'llm-error'));
    await s.post('deterministic', deterministicBody(s.id));
    expect(s.state()?.status).toBe('ready');
    expect((await s.report()).degraded).toBe(false);
  });
});

describe('watchdogs', () => {
  it('AI watchdog: analyzing -> ready with llm-unavailable and its own message', async () => {
    const s = await start();
    await s.post('deterministic', deterministicBody(s.id));
    await s.armed.fire('ai');

    expect(s.state()?.status).toBe('ready');
    expect(s.state()?.completedAt).toBe(NOW_ISO);
    expect(s.state()?.failure).toEqual({
      analysisId: s.id,
      stage: 'llm',
      reason: 'llm-unavailable',
      message: 'AI result did not arrive within the timeout window',
    });
    const report = await s.report();
    expect(report.degraded).toBe(true);
    expect(report.degradedReason).toBe('llm-unavailable');
  });

  it('retrieval watchdog: retrieving -> failed with retrieval-error and its own message', async () => {
    const s = await start();
    await s.armed.fire('retrieval');

    expect(s.state()?.status).toBe('failed');
    expect(s.state()?.completedAt).toBe(NOW_ISO);
    expect(s.state()?.failure).toEqual({
      analysisId: s.id,
      stage: 'retrieval',
      reason: 'retrieval-error',
      message: 'Retrieval did not deliver a result within the timeout window',
    });
  });

  it('the AI watchdog does nothing once the AI result arrived, and the retrieval one once it left retrieving', async () => {
    const s = await start();
    await s.post('deterministic', deterministicBody(s.id));
    await s.armed.fire('retrieval'); // left retrieving: nothing
    expect(s.state()?.status).toBe('analyzing');

    await s.post('ai-result', aiBody(s.id));
    const before = structuredClone(s.state());
    await s.armed.fire('ai');
    expect(s.state()).toEqual(before);
  });

  it('a watchdog whose analysis vanished does nothing', async () => {
    const s = await start();
    s.repo.store.delete(s.id);
    await s.armed.fire('retrieval');
    expect(s.repo.store.size).toBe(0);
    expect(s.repo.calls.at(-1)).toBe(`get:${s.id}`);
  });

  it('logs a failing retrieval watchdog to the injected logger with the analysis id and the cause', async () => {
    const messages: string[] = [];
    const repo = new FakeRepository();
    const armed = timers();
    const app = await buildApp({
      repository: repo,
      retrieval: new FakeRetrieval(),
      schedule: armed.schedule,
      newId: sequentialIds(),
      logger: { error: (message) => void messages.push(message) },
    });
    await app.inject({ method: 'POST', url: '/internal/analyses', headers: auth, payload: job() });

    repo.get = async () => {
      throw new Error('db is down');
    };
    await armed.fire('retrieval');
    expect(messages).toEqual([
      '[reports] Retrieval timeout update failed for analysis-1: db is down',
    ]);
  });
});

describe('GET /internal/analyses/:id (report shape)', () => {
  const topLevel = (body: object) => Object.keys(body);

  it('retrieving: only the basic layer, zero counts and no optional keys', async () => {
    const s = await start();
    const res = await s.get();

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(res.body).toBe(
      JSON.stringify({
        id: 'analysis-1',
        status: 'retrieving',
        createdAt: NOW_ISO,
        degraded: false,
        appliedLayers: ['basic'],
        summary: { counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 } },
        findings: [],
      }),
    );
  });

  it('analyzing (pro, no AI yet): license and severity layers, risk score and filled license fields', async () => {
    const s = await start();
    await s.post('deterministic', deterministicBody(s.id));
    const body = (await s.get()).json() as Record<string, unknown>;

    expect(topLevel(body)).toEqual([
      'id',
      'status',
      'createdAt',
      'degraded',
      'appliedLayers',
      'summary',
      'findings',
    ]);
    expect(body).toMatchObject({
      status: 'analyzing',
      degraded: false,
      appliedLayers: ['basic', 'license-compliance', 'severity-score'],
      summary: { counts: { critical: 0, high: 1, medium: 1, low: 0, info: 0 }, riskScore: 57 },
    });
    const findings = body['findings'] as Array<Record<string, unknown>>;
    expect(findings.map((f) => f['id'])).toEqual([vulnerability.id, license.id]);
    // The license finding had no `impact`: the layer fills it, `recommendation` is kept.
    expect(findings[1]?.['impact']).toBe(
      'This license may impose conditions on how your project can be distributed. Review compatibility with your distribution model.',
    );
    expect(findings[1]?.['recommendation']).toBe(license.recommendation);
  });

  it('ready with AI (pro): AI layer, AI order first and key order of the top level', async () => {
    const s = await start();
    await s.post('deterministic', deterministicBody(s.id));
    await s.post('ai-result', {
      analysisId: s.id,
      findings: [
        { ...license, aiExplanation: 'License note.' },
        { ...vulnerability, id: 'ghost' },
      ],
    });
    const body = (await s.get()).json() as Record<string, unknown>;

    expect(topLevel(body)).toEqual([
      'id',
      'status',
      'createdAt',
      'completedAt',
      'degraded',
      'appliedLayers',
      'summary',
      'findings',
    ]);
    expect(body['completedAt']).toBe(NOW_ISO);
    expect(body['appliedLayers']).toEqual([
      'basic',
      'license-compliance',
      'ai-enrichment',
      'severity-score',
    ]);
    const findings = body['findings'] as Array<Record<string, unknown>>;
    // The AI named the license finding first; the unknown id is dropped; the rest keeps its order.
    expect(findings.map((f) => f['id'])).toEqual([license.id, vulnerability.id]);
    expect(findings[0]?.['aiExplanation']).toBe('License note.');
    expect(Object.keys(body['summary'] as object)).toEqual(['counts', 'riskScore']);
  });

  it('ready on the free plan: never the AI layer, even if an AI result is stored', async () => {
    const s = await start({ plan: 'free' });
    await s.post('deterministic', deterministicBody(s.id));
    const report = await s.report();
    expect(report.status).toBe('ready');
    expect(report.appliedLayers).toEqual(['basic', 'license-compliance', 'severity-score']);
    expect(report.degraded).toBe(false);
  });

  it('degraded (llm failure after the deterministic result): reason, banner flag and layers', async () => {
    const s = await start();
    await s.post('deterministic', deterministicBody(s.id));
    await s.post('failure', failureBody(s.id, 'llm', 'llm-error'));
    const body = (await s.get()).json() as Record<string, unknown>;

    expect(topLevel(body)).toEqual([
      'id',
      'status',
      'createdAt',
      'completedAt',
      'degraded',
      'degradedReason',
      'appliedLayers',
      'summary',
      'findings',
    ]);
    expect(body).toMatchObject({ status: 'ready', degraded: true, degradedReason: 'llm-error' });
  });

  it('failed by retrieval: the error key comes last and carries the failure message', async () => {
    const s = await start();
    await s.post('failure', failureBody(s.id, 'retrieval', 'retrieval-error', 'No evidence'));
    const body = (await s.get()).json() as Record<string, unknown>;

    expect(topLevel(body)).toEqual([
      'id',
      'status',
      'createdAt',
      'completedAt',
      'degraded',
      'appliedLayers',
      'summary',
      'findings',
      'error',
    ]);
    expect(body['error']).toEqual({ code: 'internal', message: 'No evidence' });
    expect(body['findings']).toEqual([]);
    expect(body['appliedLayers']).toEqual(['basic']);
  });
});

describe('GET /internal/analyses/:id/markdown', () => {
  it('answers text/markdown with the rendered report', async () => {
    const s = await start({ plan: 'free' });
    await s.post('deterministic', deterministicBody(s.id, []));
    const res = await s.get('/markdown');

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/markdown; charset=utf-8');
    expect(res.body).toBe(
      [
        '# Reporte de análisis — `analysis-1`',
        '_Generado el 2026-10-18_',
        '**Estado:** ready · **Riesgo:** 0/100\n\n' +
          '| Críticos | Altos | Medios | Bajos | Informativos |\n' +
          '|:---:|:---:|:---:|:---:|:---:|\n' +
          '| 0 | 0 | 0 | 0 | 0 |',
        '## Hallazgos',
        '_No se encontraron hallazgos._',
      ].join('\n\n'),
    );
  });

  it('groups license findings in their own section and the rest by severity', async () => {
    const s = await start({ plan: 'free' });
    await s.post('deterministic', deterministicBody(s.id));
    const md = (await s.get('/markdown')).body;

    expect(md).toContain('## Cumplimiento de licencias');
    expect(md).toContain('### Altos (1)');
    expect(md).not.toContain('### Medios');
    expect(md.indexOf('## Cumplimiento de licencias')).toBeLessThan(md.indexOf('## Hallazgos'));
  });

  it('answers 404 as JSON, without the markdown content-type', async () => {
    const s = await start();
    const res = await s.get('/markdown', 'tenant-2');
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
  });
});

describe('errors that are not application errors', () => {
  it('a repository failure while reading is a 500 internal, not a 404', async () => {
    const s = await start();
    s.repo.get = async () => {
      throw new Error('db is down');
    };
    const res = await s.get();
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ error: { code: 'internal' } });
    expect(res.body).not.toContain('db is down');
  });

  it('a repository failure while recording is a 500 internal', async () => {
    const s = await start();
    s.repo.get = async () => {
      throw new Error('db is down');
    };
    const res = await s.post('deterministic', deterministicBody(s.id));
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ error: { code: 'internal' } });
  });
});

describe('PostgreSQL persistence (PGlite)', () => {
  async function rows(database: DatabaseHandle, id: string) {
    const result = (await database.db.execute(
      sql`select status, ai_expected, entitlements, deterministic, ai, failure, created_at, completed_at from analyses where id = ${id}`,
    )) as unknown as { rows: Record<string, unknown>[] };
    return result.rows[0];
  }

  it('writes the expected columns after each transition', async () => {
    const database = createPgliteDatabase();
    const armed = timers();
    const app = await buildApp(
      { retrieval: new FakeRetrieval(), schedule: armed.schedule, newId: sequentialIds() },
      database,
    );
    await app.inject({ method: 'POST', url: '/internal/analyses', headers: auth, payload: job() });

    let row = await rows(database, 'analysis-1');
    expect(row).toMatchObject({
      status: 'retrieving',
      ai_expected: true,
      entitlements: PLAN_CATALOG.pro,
      deterministic: null,
      ai: null,
      failure: null,
      completed_at: null,
    });
    expect(new Date(row?.['created_at'] as string).toISOString()).toBe(NOW_ISO);

    await app.inject({
      method: 'POST',
      url: '/internal/analyses/analysis-1/deterministic',
      headers: auth,
      payload: deterministicBody('analysis-1'),
    });
    row = await rows(database, 'analysis-1');
    expect(row).toMatchObject({
      status: 'analyzing',
      deterministic: deterministicBody('analysis-1'),
      completed_at: null,
    });

    await app.inject({
      method: 'POST',
      url: '/internal/analyses/analysis-1/failure',
      headers: auth,
      payload: failureBody('analysis-1', 'llm', 'llm-error', 'boom'),
    });
    row = await rows(database, 'analysis-1');
    expect(row).toMatchObject({
      status: 'ready',
      failure: failureBody('analysis-1', 'llm', 'llm-error', 'boom'),
    });
    expect(new Date(row?.['completed_at'] as string).toISOString()).toBe(NOW_ISO);
  });

  it('reads back every stored field unchanged', async () => {
    const database = createPgliteDatabase();
    await database.migrate();
    const repository = viaSnapshots(new PostgresReportRepository(database.db));
    const full = {
      id: 'full-1',
      tenantId: 'tenant-1',
      entitlements: PLAN_CATALOG.studio,
      aiExpected: true,
      status: 'ready' as const,
      createdAt: '2026-10-18T10:00:00.000Z',
      completedAt: '2026-10-18T10:00:05.000Z',
      deterministic: deterministicBody('full-1'),
      ai: aiBody('full-1'),
      failure: failureBody('full-1', 'llm', 'llm-error'),
    };
    await repository.create(full);
    expect(await repository.get('full-1')).toEqual(full);
    await database.close();
  });

  it('returns what a legacy row holds without validating it', async () => {
    const database = createPgliteDatabase();
    await database.migrate();
    const legacy = {
      analysisId: 'old-1',
      findings: [],
      legacyField: 'kept',
      partialSources: false,
    };
    await database.db.execute(
      sql`insert into analyses (id, tenant_id, status, ai_expected, entitlements, deterministic, created_at, updated_at)
          values ('old-1', 'tenant-1', 'ready', false, ${JSON.stringify(PLAN_CATALOG.free)}::jsonb, ${JSON.stringify(legacy)}::jsonb, now(), now())`,
    );
    const repository = viaSnapshots(new PostgresReportRepository(database.db));
    const stored = await repository.get('old-1');
    expect(stored?.deterministic).toEqual(legacy);
    expect(stored?.entitlements).toEqual(PLAN_CATALOG.free);
    await database.close();
  });

  it('update inserts the row when it does not exist (upsert)', async () => {
    const database = createPgliteDatabase();
    await database.migrate();
    const repository = viaSnapshots(new PostgresReportRepository(database.db));
    await repository.update({
      id: 'never-created',
      tenantId: 'tenant-1',
      entitlements: PLAN_CATALOG.pro,
      aiExpected: false,
      status: 'retrieving',
      createdAt: NOW_ISO,
    });
    expect((await repository.get('never-created'))?.status).toBe('retrieving');
    await database.close();
  });

  it('R6: update rewrites the whole row with no locking, so a write built from an older read erases newer data', async () => {
    const database = createPgliteDatabase();
    await database.migrate();
    const repository = viaSnapshots(new PostgresReportRepository(database.db));
    const created = {
      id: 'race-1',
      tenantId: 'tenant-1',
      entitlements: PLAN_CATALOG.pro,
      aiExpected: true,
      status: 'retrieving' as const,
      createdAt: NOW_ISO,
    };
    await repository.create(created);
    const stale = await repository.get('race-1');
    await repository.update({
      ...created,
      status: 'analyzing',
      deterministic: deterministicBody('race-1'),
    });

    if (stale) await repository.update({ ...stale, ai: aiBody('race-1') });
    const final = await repository.get('race-1');
    expect(final?.status).toBe('retrieving');
    expect(final?.deterministic).toBeUndefined();
    expect(final?.ai).toEqual(aiBody('race-1'));
    await database.close();
  });

  it('the in-memory repository hands out copies, so changing one changes nothing stored', async () => {
    const repository = new InMemoryReportRepository();
    await repository.create(
      Analysis.rehydrate({
        id: 'm-1',
        tenantId: 'tenant-1',
        entitlements: PLAN_CATALOG.pro,
        aiExpected: true,
        status: 'retrieving',
        createdAt: NOW_ISO,
      }),
    );
    const first = await repository.get('m-1');
    first?.timeOutRetrieval(NOW, 'timeout');
    expect(first?.status).toBe('failed');
    expect((await repository.get('m-1'))?.status).toBe('retrieving');
    expect(await repository.get('ghost')).toBeUndefined();
  });
});

describe('startup sweep: thresholds, messages and log', () => {
  const entitlements = PLAN_CATALOG.pro;
  const leftover = (id: string, status: 'analyzing' | 'retrieving', ageMs: number) => ({
    id,
    tenantId: 'tenant-1',
    entitlements,
    aiExpected: true,
    status,
    createdAt: new Date(NOW.getTime() - ageMs).toISOString(),
  });

  it('closes exactly what is older than or equal to each timeout, with the restart messages', async () => {
    const database = createPgliteDatabase();
    await database.migrate();
    const repository = viaSnapshots(new PostgresReportRepository(database.db));
    const ai = config.REPORTS_AI_TIMEOUT_MS;
    const ret = config.REPORTS_RETRIEVAL_TIMEOUT_MS;
    await repository.create(leftover('ai-exact', 'analyzing', ai));
    await repository.create(leftover('ai-fresh', 'analyzing', ai - 1));
    await repository.create(leftover('ret-exact', 'retrieving', ret));
    await repository.create(leftover('ret-fresh', 'retrieving', ret - 1));
    // An analyzing job older than the AI timeout but younger than the retrieval one is still swept as analyzing.
    const log = vi.spyOn(Logger.prototype, 'log');

    await buildApp({ retrieval: new FakeRetrieval() }, database);

    const aiExact = await repository.get('ai-exact');
    expect(aiExact).toMatchObject({
      status: 'ready',
      completedAt: NOW_ISO,
      failure: {
        analysisId: 'ai-exact',
        stage: 'llm',
        reason: 'llm-unavailable',
        message: 'AI result did not arrive before the service restarted',
      },
    });
    const retExact = await repository.get('ret-exact');
    expect(retExact).toMatchObject({
      status: 'failed',
      completedAt: NOW_ISO,
      failure: {
        analysisId: 'ret-exact',
        stage: 'retrieval',
        reason: 'retrieval-error',
        message: 'Retrieval did not deliver a result before the service restarted',
      },
    });
    expect((await repository.get('ai-fresh'))?.status).toBe('analyzing');
    expect((await repository.get('ret-fresh'))?.status).toBe('retrieving');

    const messages = log.mock.calls.map((call) => String(call[0]));
    expect(messages).toContain('database migrations applied');
    expect(messages).toContain(
      'startup sweep closed 1 stale analyzing and 1 stale retrieving analyses',
    );
  });

  it('logs nothing about the sweep when there is nothing stale, and never runs in memory', async () => {
    const database = createPgliteDatabase();
    const log = vi.spyOn(Logger.prototype, 'log');
    await buildApp({ retrieval: new FakeRetrieval() }, database);
    expect(log.mock.calls.map((call) => String(call[0])).join('\n')).not.toContain('startup sweep');
  });
});

/**
 * KNOWN BEHAVIORS. Odd, but they are what the service does today; the refactor must keep them.
 * Each one is a decision for the owners, not a bug fixed here.
 */
describe('known behaviors preserved by the refactor', () => {
  it('R2: a degradedReason is cast from failure.reason, so a retrieval reason on an llm failure leaks into the report and the markdown', async () => {
    const s = await start();
    await s.post('deterministic', deterministicBody(s.id));
    await s.post('failure', failureBody(s.id, 'llm', 'retrieval-error', 'odd'));

    const body = (await s.get()).json() as { degraded: boolean; degradedReason: string };
    expect(body.degraded).toBe(true);
    expect(body.degradedReason).toBe('retrieval-error');
    const md = (await s.get('/markdown')).body;
    expect(md).toContain('> ⚠️ **Reporte degradado** · undefined');
  });

  it('R3: an llm failure while still retrieving (AI expected) closes an empty, degraded, ready report and the later deterministic result is ignored', async () => {
    const s = await start();
    await s.post('failure', failureBody(s.id, 'llm', 'llm-unavailable'));

    expect(s.state()?.status).toBe('ready');
    expect(s.state()?.deterministic).toBeUndefined();
    const report = await s.report();
    expect(report).toMatchObject({
      status: 'ready',
      degraded: true,
      degradedReason: 'llm-unavailable',
      appliedLayers: ['basic'],
      findings: [],
    });
    expect(report.summary).toEqual({
      counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    });

    const before = structuredClone(s.state());
    expect((await s.post('deterministic', deterministicBody(s.id))).statusCode).toBe(204);
    expect(s.state()).toEqual(before);
  });

  it('R4: an AI result is stored even when AI was not expected, and the report applies the AI layer when the plan allows it', async () => {
    const s = await start({ plan: 'pro', includeAi: false });
    expect(s.state()?.aiExpected).toBe(false);

    await s.post('ai-result', aiBody(s.id));
    expect(s.state()?.ai).toEqual(aiBody(s.id));
    expect(s.state()?.status).toBe('retrieving');

    await s.post('deterministic', deterministicBody(s.id));
    expect(s.state()?.status).toBe('ready');
    const report = await s.report();
    expect(report.degraded).toBe(false);
    expect(report.appliedLayers).toContain('ai-enrichment');
    expect(report.findings[0]?.aiExplanation).toBe('Explained by the model.');
  });

  it('R5: the AI watchdog is armed only when the deterministic result leaves the job analyzing', async () => {
    const free = await start({ plan: 'free' });
    await free.post('deterministic', deterministicBody(free.id));
    expect(free.armed.of('ai')).toHaveLength(0);

    const early = await start();
    await early.post('ai-result', aiBody(early.id));
    await early.post('deterministic', deterministicBody(early.id));
    expect(early.armed.of('ai')).toHaveLength(0);
  });
});
