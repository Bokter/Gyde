import {
  type CreateAnalysisJob,
  HEADERS,
  PLAN_CATALOG,
  Report,
  type ReportStatus,
} from '@gyde/contracts';
import { sampleAnalysisRequest, sampleVulnerabilityFinding } from '@gyde/contracts/samples';
import { createLogger } from '@gyde/service-kit';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@gyde/service-kit';

import type { AppModuleOverrides } from '../src/app.module';
import type { ReportRepository, StoredAnalysis } from '../src/application/ports/report-repository';
import type { TimerName } from '../src/application/analysis-lifecycle';
import type { RetrievalClient } from '../src/application/ports/retrieval-client';
import { configSchema } from '../src/config';
import type { DatabaseHandle } from '../src/infrastructure/db/database';
import { PostgresReportRepository } from '../src/infrastructure/postgres-report.repository';
import { createApp } from '../src/http/app';
import { createPgliteDatabase } from './support/pglite';

const token = 'test-internal-token-123456';
const config = configSchema.parse({ INTERNAL_SERVICE_TOKEN: token });
const auth = { [HEADERS.internalToken]: token };
/** What the gateway sends on a read: the internal token plus the tenant of the API key. */
const asTenant = (tenantId: string) => ({ ...auth, [HEADERS.tenantId]: tenantId });

/** Fake repository: records every call so the tests can assert on it. */
class FakeRepository implements ReportRepository {
  readonly store = new Map<string, StoredAnalysis>();
  readonly calls: string[] = [];
  /** Makes the update that finishes a job fail (the watchdog runs one of those). */
  failReadyUpdates = false;

  async create(analysis: StoredAnalysis): Promise<void> {
    this.calls.push(`create:${analysis.id}`);
    this.store.set(analysis.id, structuredClone(analysis));
  }

  async get(id: string): Promise<StoredAnalysis | undefined> {
    this.calls.push(`get:${id}`);
    const found = this.store.get(id);
    return found ? structuredClone(found) : undefined;
  }

  async update(analysis: StoredAnalysis): Promise<void> {
    if (this.failReadyUpdates && analysis.status === 'ready') throw new Error('db is down');
    this.calls.push(`update:${analysis.id}`);
    this.store.set(analysis.id, structuredClone(analysis));
  }

  /**
   * Nothing is stale: the timers of this process cover every job it started, and the startup
   * sweep only runs when the app is built with a database (PostgreSQL tests use the real one).
   */
  async findStale(_status: ReportStatus, _cutoff: Date): Promise<StoredAnalysis[]> {
    return [];
  }
}

/** Fake retrieval: records the requests it received; can be told to fail. */
class FakeRetrieval implements RetrievalClient {
  readonly requests: unknown[] = [];
  failWith?: Error;

  async retrieve(request: unknown): Promise<void> {
    this.requests.push(request);
    if (this.failWith) throw this.failWith;
  }
}

async function buildApp(
  overrides: AppModuleOverrides = {},
  database?: DatabaseHandle,
): Promise<NestFastifyApplication> {
  return createApp({
    config,
    logger: createLogger({ name: 'reports-test', level: 'silent' }),
    database,
    overrides,
  });
}

function jobPayload(): CreateAnalysisJob {
  return {
    tenantId: 'tenant-1',
    entitlements: PLAN_CATALOG.pro,
    request: sampleAnalysisRequest,
  };
}

describe('reports skeleton', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await buildApp({});
  });
  afterAll(() => app.close());

  it('is alive', async () => {
    expect((await app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
  });

  it('refuses /internal calls without the token', async () => {
    const res = await app.inject({ method: 'GET', url: '/internal/analyses/analysis-1' });
    expect(res.statusCode).toBe(401);
  });

  it('validates the job body and answers 202 once implemented', async () => {
    const invalid = await app.inject({
      method: 'POST',
      url: '/internal/analyses',
      headers: auth,
      payload: { nope: true },
    });
    expect(invalid.statusCode).toBe(400);

    const valid = await app.inject({
      method: 'POST',
      url: '/internal/analyses',
      headers: auth,
      payload: jobPayload(),
    });
    expect(valid.statusCode).toBe(202);
  });
});

describe('POST /internal/analyses and GET /internal/analyses/:id', () => {
  let app: NestFastifyApplication;
  let repository: FakeRepository;
  let retrieval: FakeRetrieval;

  beforeAll(async () => {
    repository = new FakeRepository();
    retrieval = new FakeRetrieval();
    app = await buildApp({ repository, retrieval });
  });
  afterAll(() => app.close());

  it('creates the job, calls Retrieval and answers 202 with the id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/analyses',
      headers: auth,
      payload: jobPayload(),
    });

    expect(res.statusCode).toBe(202);
    const body = res.json() as { analysisId: string; status: string };
    expect(body.analysisId).toBeTruthy();
    expect(body.status).toBe('retrieving');

    expect(retrieval.requests).toHaveLength(1);
    const sent = retrieval.requests[0] as Record<string, unknown>;
    expect(sent['analysisId']).toBe(body.analysisId);
    expect(sent['tenantId']).toBe('tenant-1');

    expect(repository.store.get(body.analysisId)?.status).toBe('retrieving');
  });

  it('marks the job as failed when Retrieval is unavailable, still answering 202', async () => {
    const failingRetrieval = new FakeRetrieval();
    failingRetrieval.failWith = new Error('Retrieval is down');
    const failingRepo = new FakeRepository();
    const failingApp = await buildApp({ repository: failingRepo, retrieval: failingRetrieval });

    const res = await failingApp.inject({
      method: 'POST',
      url: '/internal/analyses',
      headers: auth,
      payload: jobPayload(),
    });

    expect(res.statusCode).toBe(202);
    const body = res.json() as { analysisId: string };
    const stored = failingRepo.store.get(body.analysisId);
    expect(stored?.status).toBe('failed');
    expect(stored?.failure?.stage).toBe('retrieval');
    expect(stored?.failure?.reason).toBe('retrieval-error');
    await failingApp.close();
  });

  it('GET /internal/analyses/:id returns a Report valid against the contract schema', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/internal/analyses',
      headers: auth,
      payload: jobPayload(),
    });
    const { analysisId } = createRes.json() as { analysisId: string };

    const getRes = await app.inject({
      method: 'GET',
      url: `/internal/analyses/${analysisId}`,
      headers: asTenant('tenant-1'),
    });

    expect(getRes.statusCode).toBe(200);
    const report = getRes.json() as unknown;
    expect(Report.safeParse(report).success).toBe(true);
    const parsed = Report.parse(report);
    expect(parsed.id).toBe(analysisId);
    expect(parsed.status).toBe('retrieving');
    expect(parsed.degraded).toBe(false);
    expect(parsed.appliedLayers).toEqual(['basic']);
  });
});

/** Acceptance criteria for Area 4. */
describe('record methods and full lifecycle', () => {
  /**
   * Helper: creates an analysis and returns its id.
   * `scheduleOverride` lets us inject a fake scheduler so the timeout fires synchronously
   * or is suppressed entirely.
   */
  async function createAndInspect(
    schedule?: (fn: () => void, ms: number, timer?: TimerName) => void,
    overridePayload?: Partial<CreateAnalysisJob>,
  ) {
    const repo = new FakeRepository();
    const retrieval = new FakeRetrieval();
    const app = await buildApp({ repository: repo, retrieval, schedule });
    const res = await app.inject({
      method: 'POST',
      url: '/internal/analyses',
      headers: auth,
      payload: { ...jobPayload(), ...overridePayload },
    });
    const { analysisId } = res.json() as { analysisId: string };
    return { app, repo, retrieval, analysisId };
  }

  it('recordDeterministic moves the job to analyzing when AI is expected, ready otherwise', async () => {
    // Case 1: AI expected (pro plan + includeAi = true → default jobPayload)
    const {
      app: app1,
      analysisId: id1,
      repo: repo1,
    } = await createAndInspect(
      () => {}, // no-op schedule: suppress the timeout
    );
    const deterministicBody = {
      analysisId: id1,
      findings: [],
      evidence: [],
      coverage: { vulnerabilities: true, compatibility: true, licenses: true },
      partialSources: false,
    };
    const r1 = await app1.inject({
      method: 'POST',
      url: `/internal/analyses/${id1}/deterministic`,
      headers: auth,
      payload: deterministicBody,
    });
    expect(r1.statusCode).toBe(204);
    expect(repo1.store.get(id1)?.status).toBe('analyzing');

    // Case 2: AI NOT expected (free plan has aiEnrichment = false)
    const {
      app: app2,
      analysisId: id2,
      repo: repo2,
    } = await createAndInspect(() => {}, { entitlements: PLAN_CATALOG.free });
    const r2 = await app2.inject({
      method: 'POST',
      url: `/internal/analyses/${id2}/deterministic`,
      headers: auth,
      payload: { ...deterministicBody, analysisId: id2 },
    });
    expect(r2.statusCode).toBe(204);
    expect(repo2.store.get(id2)?.status).toBe('ready');

    await app1.close();
    await app2.close();
  });

  it('recordAi moves the job to ready and the report includes the AI explanations', async () => {
    const { app, analysisId, repo } = await createAndInspect(() => {}); // suppress timeout

    const detFinding = {
      ...sampleVulnerabilityFinding,
      id: 'finding-1',
    };
    // First push deterministic to get to analyzing
    await app.inject({
      method: 'POST',
      url: `/internal/analyses/${analysisId}/deterministic`,
      headers: auth,
      payload: {
        analysisId,
        findings: [detFinding],
        evidence: [],
        coverage: { vulnerabilities: true, compatibility: true, licenses: true },
        partialSources: false,
      },
    });
    expect(repo.store.get(analysisId)?.status).toBe('analyzing');

    // Then push the AI result
    const aiBody = {
      analysisId,
      findings: [
        {
          ...detFinding,
          aiExplanation: 'Esta es una vulnerabilidad explicada por IA.',
        },
      ],
      summary: 'Everything looks fine.',
    };
    const aiRes = await app.inject({
      method: 'POST',
      url: `/internal/analyses/${analysisId}/ai-result`,
      headers: auth,
      payload: aiBody,
    });
    expect(aiRes.statusCode).toBe(204);
    expect(repo.store.get(analysisId)?.status).toBe('ready');
    expect(repo.store.get(analysisId)?.ai).toBeDefined();

    const getRes = await app.inject({
      method: 'GET',
      url: `/internal/analyses/${analysisId}`,
      headers: asTenant('tenant-1'),
    });
    const report = Report.parse(getRes.json());
    expect(report.status).toBe('ready');
    expect(report.appliedLayers).toContain('ai-enrichment');
    expect(report.findings[0]?.aiExplanation).toBe('Esta es una vulnerabilidad explicada por IA.');

    await app.close();
  });

  it('an llm failure makes the report ready and degraded with the reason (never failed)', async () => {
    const { app, analysisId, repo } = await createAndInspect(() => {}); // suppress timeout

    await app.inject({
      method: 'POST',
      url: `/internal/analyses/${analysisId}/deterministic`,
      headers: auth,
      payload: {
        analysisId,
        findings: [],
        evidence: [],
        coverage: { vulnerabilities: true, compatibility: true, licenses: true },
        partialSources: false,
      },
    });

    const failureRes = await app.inject({
      method: 'POST',
      url: `/internal/analyses/${analysisId}/failure`,
      headers: auth,
      payload: {
        analysisId,
        stage: 'llm',
        reason: 'llm-error',
        message: 'The provider returned 500.',
      },
    });
    expect(failureRes.statusCode).toBe(204);

    const stored = repo.store.get(analysisId);
    expect(stored?.status).toBe('ready');
    expect(stored?.failure?.reason).toBe('llm-error');

    // GET must show it as degraded, NOT failed
    const getRes = await app.inject({
      method: 'GET',
      url: `/internal/analyses/${analysisId}`,
      headers: asTenant('tenant-1'),
    });
    const report = Report.parse(getRes.json());
    expect(report.status).toBe('ready');
    expect(report.degraded).toBe(true);
    expect(report.degradedReason).toBe('llm-error');

    await app.close();
  });

  it('a retrieval failure makes the report failed with a clear error', async () => {
    const failingRetrieval = new FakeRetrieval();
    failingRetrieval.failWith = new Error('Retrieval is down');
    const repo = new FakeRepository();
    const app = await buildApp({ repository: repo, retrieval: failingRetrieval });

    const res = await app.inject({
      method: 'POST',
      url: '/internal/analyses',
      headers: auth,
      payload: jobPayload(),
    });
    expect(res.statusCode).toBe(202);
    const { analysisId } = res.json() as { analysisId: string };

    const stored = repo.store.get(analysisId);
    expect(stored?.status).toBe('failed');
    expect(stored?.failure?.stage).toBe('retrieval');
    expect(stored?.failure?.reason).toBe('retrieval-error');
    expect(stored?.failure?.message).toBeTruthy();

    await app.close();
  });

  it('a report whose AI result never arrives becomes degraded after REPORTS_AI_TIMEOUT_MS', async () => {
    // schedule that fires immediately (simulates the timeout expiring right away)
    const immediateSchedule = (fn: () => void, _ms: number, timer?: TimerName) => {
      if (timer === 'ai') void Promise.resolve().then(fn);
    };

    const { app, analysisId, repo } = await createAndInspect(immediateSchedule);

    // Push deterministic to start the timer
    await app.inject({
      method: 'POST',
      url: `/internal/analyses/${analysisId}/deterministic`,
      headers: auth,
      payload: {
        analysisId,
        findings: [],
        evidence: [],
        coverage: { vulnerabilities: true, compatibility: true, licenses: true },
        partialSources: false,
      },
    });

    // Yield to the microtask queue so the async timeout callback runs
    await new Promise((resolve) => setTimeout(resolve, 10));

    const stored = repo.store.get(analysisId);
    expect(stored?.status).toBe('ready');
    expect(stored?.failure?.reason).toBe('llm-unavailable');

    const getRes = await app.inject({
      method: 'GET',
      url: `/internal/analyses/${analysisId}`,
      headers: asTenant('tenant-1'),
    });
    const report = Report.parse(getRes.json());
    expect(report.degraded).toBe(true);
    expect(report.degradedReason).toBe('llm-unavailable');

    await app.close();
  });

  it('a report is NOT degraded when AI was not expected (plan or client option)', async () => {
    // Free plan: aiEnrichment = false → aiExpected = false → llm failure is ignored
    const { app, analysisId, repo } = await createAndInspect(() => {}, {
      entitlements: PLAN_CATALOG.free,
    });

    // Push deterministic → becomes ready
    await app.inject({
      method: 'POST',
      url: `/internal/analyses/${analysisId}/deterministic`,
      headers: auth,
      payload: {
        analysisId,
        findings: [],
        evidence: [],
        coverage: { vulnerabilities: false, compatibility: false, licenses: true },
        partialSources: false,
      },
    });

    // Try to push an llm failure → must be ignored
    await app.inject({
      method: 'POST',
      url: `/internal/analyses/${analysisId}/failure`,
      headers: auth,
      payload: {
        analysisId,
        stage: 'llm',
        reason: 'llm-unavailable',
        message: 'service is down',
      },
    });

    const getRes = await app.inject({
      method: 'GET',
      url: `/internal/analyses/${analysisId}`,
      headers: asTenant('tenant-1'),
    });
    const report = Report.parse(getRes.json());
    expect(report.status).toBe('ready');
    expect(report.degraded).toBe(false);
    expect(report.degradedReason).toBeUndefined();

    // Also: partialSources in the deterministic result must NOT cause degradation
    expect(repo.store.get(analysisId)?.deterministic?.partialSources).toBe(false);

    await app.close();
  });

  it('GET /internal/analyses/:id/markdown returns the rendered Markdown', async () => {
    const { app, analysisId } = await createAndInspect(() => {});

    const getRes = await app.inject({
      method: 'GET',
      url: `/internal/analyses/${analysisId}/markdown`,
      headers: asTenant('tenant-1'),
    });

    expect(getRes.statusCode).toBe(200);
    expect(getRes.headers['content-type']).toContain('text/markdown');
    expect(getRes.body).toContain(analysisId);
    // The analysis is still 'retrieving' so no findings section with actual content,
    // but the title and status must be there.
    expect(getRes.body).toContain('Reporte de análisis');

    await app.close();
  });

  it('reports are stored and read back from the reports schema in PostgreSQL', async () => {
    const database = createPgliteDatabase();
    const app = await buildApp({ retrieval: new FakeRetrieval() }, database);

    const createRes = await app.inject({
      method: 'POST',
      url: '/internal/analyses',
      headers: auth,
      payload: jobPayload(),
    });
    expect(createRes.statusCode).toBe(202);
    const { analysisId } = createRes.json() as { analysisId: string };

    // Read back through the API: the report is served from PostgreSQL, not from process memory.
    const getRes = await app.inject({
      method: 'GET',
      url: `/internal/analyses/${analysisId}`,
      headers: asTenant('tenant-1'),
    });
    expect(Report.parse(getRes.json()).id).toBe(analysisId);

    // The tenant check lives in the use case, so it holds over PostgreSQL too.
    const foreign = await app.inject({
      method: 'GET',
      url: `/internal/analyses/${analysisId}`,
      headers: asTenant('tenant-2'),
    });
    expect(foreign.statusCode).toBe(404);

    // And the row really lives in the `analyses` table: query it with raw SQL.
    const rows = (
      (await database.db.execute(
        sql`select status from analyses where id = ${analysisId}`,
      )) as unknown as { rows: Record<string, unknown>[] }
    ).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('retrieving');

    await app.close();
  });
});

/** PR H: a restart must not leave analyses stuck in `retrieving`/`analyzing` forever. */
describe('startup sweep', () => {
  /** What a previous run left in the database: rows written long before this process started. */
  function leftover(id: string, status: ReportStatus): StoredAnalysis {
    return {
      id,
      tenantId: 'tenant-1',
      entitlements: PLAN_CATALOG.pro,
      aiExpected: true,
      status,
      createdAt: '2020-01-01T00:00:00.000Z',
    };
  }

  it('closes the analyses a previous run left in progress when the service starts', async () => {
    const database = createPgliteDatabase();
    await database.migrate(); // the schema (and the rows) of the run that went down
    const repository = new PostgresReportRepository(database.db);
    await repository.create(leftover('stale-analyzing', 'analyzing'));
    await repository.create(leftover('stale-retrieving', 'retrieving'));
    await repository.create({
      ...leftover('fresh-analyzing', 'analyzing'),
      createdAt: new Date().toISOString(),
    });

    // Building the app runs the sweep (onModuleInit): migrate → sweep → log.
    const app = await buildApp({ retrieval: new FakeRetrieval() }, database);

    // Waiting for AI that never arrives → ready and degraded, exactly like the AI watchdog.
    const analyzing = await repository.get('stale-analyzing');
    expect(analyzing?.status).toBe('ready');
    expect(analyzing?.completedAt).toBeTruthy();
    expect(analyzing?.failure).toMatchObject({ stage: 'llm', reason: 'llm-unavailable' });

    // Retrieval never answered → failed, exactly like the retrieval watchdog.
    const retrieving = await repository.get('stale-retrieving');
    expect(retrieving?.status).toBe('failed');
    expect(retrieving?.failure).toMatchObject({ stage: 'retrieval', reason: 'retrieval-error' });

    // A job this run just started is not stale: the sweep must leave it untouched.
    expect((await repository.get('fresh-analyzing'))?.status).toBe('analyzing');

    // The API serves the swept report as degraded, never as failed.
    const res = await app.inject({
      method: 'GET',
      url: '/internal/analyses/stale-analyzing',
      headers: asTenant('tenant-1'),
    });
    const report = Report.parse(res.json());
    expect(report.status).toBe('ready');
    expect(report.degraded).toBe(true);
    expect(report.degradedReason).toBe('llm-unavailable');

    await app.close();
  });
});

/** Review feedback on PR #37: 404 instead of 500, duplicate deliveries, injected watchdog logger. */
describe('lifecycle hardening', () => {
  const deterministicBody = (analysisId: string) => ({
    analysisId,
    findings: [],
    evidence: [],
    coverage: { vulnerabilities: true, compatibility: true, licenses: true },
    partialSources: false,
  });

  it('answers 404 not_found when the analysis does not exist, never a 500', async () => {
    const app = await buildApp({
      repository: new FakeRepository(),
      retrieval: new FakeRetrieval(),
    });

    const get = await app.inject({
      method: 'GET',
      url: '/internal/analyses/ghost',
      headers: asTenant('tenant-1'),
    });
    expect(get.statusCode).toBe(404);
    expect(get.json()).toMatchObject({ error: { code: 'not_found' } });

    const markdown = await app.inject({
      method: 'GET',
      url: '/internal/analyses/ghost/markdown',
      headers: asTenant('tenant-1'),
    });
    expect(markdown.statusCode).toBe(404);

    const deterministic = await app.inject({
      method: 'POST',
      url: '/internal/analyses/ghost/deterministic',
      headers: auth,
      payload: deterministicBody('ghost'),
    });
    expect(deterministic.statusCode).toBe(404);
    expect(deterministic.json()).toMatchObject({ error: { code: 'not_found' } });

    const ai = await app.inject({
      method: 'POST',
      url: '/internal/analyses/ghost/ai-result',
      headers: auth,
      payload: { analysisId: 'ghost', findings: [] },
    });
    expect(ai.statusCode).toBe(404);

    const failure = await app.inject({
      method: 'POST',
      url: '/internal/analyses/ghost/failure',
      headers: auth,
      payload: {
        analysisId: 'ghost',
        stage: 'llm',
        reason: 'llm-error',
        message: 'The provider returned 500.',
      },
    });
    expect(failure.statusCode).toBe(404);

    await app.close();
  });

  it('ignores a duplicate deterministic delivery instead of returning to analyzing', async () => {
    const repo = new FakeRepository();
    const app = await buildApp({
      repository: repo,
      retrieval: new FakeRetrieval(),
      schedule: () => {}, // suppress the timeout
    });
    const res = await app.inject({
      method: 'POST',
      url: '/internal/analyses',
      headers: auth,
      payload: jobPayload(),
    });
    const { analysisId } = res.json() as { analysisId: string };

    // First delivery: retrieving → analyzing.
    await app.inject({
      method: 'POST',
      url: `/internal/analyses/${analysisId}/deterministic`,
      headers: auth,
      payload: deterministicBody(analysisId),
    });
    expect(repo.store.get(analysisId)?.status).toBe('analyzing');

    // The AI result finishes the job.
    await app.inject({
      method: 'POST',
      url: `/internal/analyses/${analysisId}/ai-result`,
      headers: auth,
      payload: { analysisId, findings: [] },
    });
    expect(repo.store.get(analysisId)?.status).toBe('ready');

    // A duplicate (or late) deterministic delivery answers 204 but changes nothing.
    const duplicate = await app.inject({
      method: 'POST',
      url: `/internal/analyses/${analysisId}/deterministic`,
      headers: auth,
      payload: { ...deterministicBody(analysisId), partialSources: true },
    });
    expect(duplicate.statusCode).toBe(204);

    const stored = repo.store.get(analysisId);
    expect(stored?.status).toBe('ready');
    expect(stored?.deterministic?.partialSources).toBe(false);
    expect(stored?.deterministic?.analysisId).toBe(analysisId);

    await app.close();
  });

  it('sends a watchdog failure to the injected logger, never to console.error', async () => {
    const messages: string[] = [];
    const repo = new FakeRepository();
    repo.failReadyUpdates = true; // the repository fails exactly when the watchdog finishes the job
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const immediateSchedule = (fn: () => void, _ms: number, timer?: TimerName) => {
      if (timer === 'ai') void Promise.resolve().then(fn);
    };

    const app = await buildApp({
      repository: repo,
      retrieval: new FakeRetrieval(),
      schedule: immediateSchedule,
      logger: {
        error: (message) => {
          messages.push(message);
        },
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/internal/analyses',
      headers: auth,
      payload: jobPayload(),
    });
    const { analysisId } = res.json() as { analysisId: string };

    await app.inject({
      method: 'POST',
      url: `/internal/analyses/${analysisId}/deterministic`,
      headers: auth,
      payload: deterministicBody(analysisId),
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(repo.store.get(analysisId)?.status).toBe('analyzing'); // the watchdog could not finish it
    expect(messages.join('\n')).toContain(analysisId);
    expect(messages.join('\n')).toContain('db is down');
    expect(consoleError).not.toHaveBeenCalled();

    await app.close();
    vi.restoreAllMocks();
  });
});

describe('retrieval timeout', () => {
  const deterministicBody = (analysisId: string) => ({
    analysisId,
    findings: [],
    evidence: [],
    coverage: { vulnerabilities: true, compatibility: true, licenses: true },
    partialSources: false,
  });

  /** Captures the retrieval watchdog instead of arming a real timer; ignores the AI one. */
  function captureRetrievalTimer() {
    const fired: Array<{ fire: () => void; ms: number }> = [];
    const schedule = (fn: () => void, ms: number, timer?: TimerName) => {
      if (timer === 'retrieval') fired.push({ fire: fn, ms });
    };
    return { fired, schedule };
  }

  async function createJob(app: NestFastifyApplication) {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/analyses',
      headers: auth,
      payload: jobPayload(),
    });
    return (res.json() as { analysisId: string }).analysisId;
  }

  it('fails an analysis still in retrieving when the retrieval timeout fires', async () => {
    const repo = new FakeRepository();
    const { fired, schedule } = captureRetrievalTimer();
    const app = await buildApp({ repository: repo, retrieval: new FakeRetrieval(), schedule });
    const analysisId = await createJob(app);

    expect(fired).toHaveLength(1);
    expect(fired[0]?.ms).toBe(config.REPORTS_RETRIEVAL_TIMEOUT_MS);
    fired[0]?.fire();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const stored = repo.store.get(analysisId);
    expect(stored?.status).toBe('failed');
    expect(stored?.failure).toMatchObject({ stage: 'retrieval', reason: 'retrieval-error' });
    const res = await app.inject({
      method: 'GET',
      url: `/internal/analyses/${analysisId}`,
      headers: asTenant('tenant-1'),
    });
    const report = Report.parse(res.json());
    expect(report.status).toBe('failed');
    expect(report.error?.message).toContain('Retrieval did not deliver');

    await app.close();
  });

  it('does nothing when the analysis already left retrieving, and is not armed if retrieve() threw', async () => {
    const repo = new FakeRepository();
    const { fired, schedule } = captureRetrievalTimer();
    const app = await buildApp({ repository: repo, retrieval: new FakeRetrieval(), schedule });
    const analysisId = await createJob(app);
    await app.inject({
      method: 'POST',
      url: `/internal/analyses/${analysisId}/deterministic`,
      headers: auth,
      payload: deterministicBody(analysisId),
    });
    const before = structuredClone(repo.store.get(analysisId));

    fired[0]?.fire();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(repo.store.get(analysisId)).toEqual(before);
    expect(before?.status).toBe('analyzing');
    await app.close();

    const failing = new FakeRetrieval();
    failing.failWith = new Error('retrieval is down');
    const second = captureRetrievalTimer();
    const app2 = await buildApp({ retrieval: failing, schedule: second.schedule });
    await createJob(app2);
    expect(second.fired).toHaveLength(0);
    await app2.close();
  });
});

describe('tenant isolation on reads', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await buildApp({ repository: new FakeRepository(), retrieval: new FakeRetrieval() });
  });
  afterAll(() => app.close());

  async function createFor(tenantId: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/analyses',
      headers: auth,
      payload: { ...jobPayload(), tenantId },
    });
    return (res.json() as { analysisId: string }).analysisId;
  }

  /** The error envelope without the parts that legitimately differ between two requests. */
  function shape(body: unknown, analysisId: string): unknown {
    const { error } = body as { error: { code: string; message: string; requestId?: string } };
    return { code: error.code, message: error.message.replace(analysisId, '<id>') };
  }

  const reads = [
    { name: 'the report', suffix: '' },
    { name: 'the markdown', suffix: '/markdown' },
  ];

  it.each(reads)('lets the owner read $name', async ({ suffix }) => {
    const id = await createFor('tenant-1');
    const res = await app.inject({
      method: 'GET',
      url: `/internal/analyses/${id}${suffix}`,
      headers: asTenant('tenant-1'),
    });
    expect(res.statusCode).toBe(200);
  });

  it.each(reads)(
    'answers another tenant reading $name exactly like a missing analysis',
    async ({ suffix }) => {
      const id = await createFor('tenant-1');
      const foreign = await app.inject({
        method: 'GET',
        url: `/internal/analyses/${id}${suffix}`,
        headers: asTenant('tenant-2'),
      });
      const missing = await app.inject({
        method: 'GET',
        url: `/internal/analyses/does-not-exist${suffix}`,
        headers: asTenant('tenant-2'),
      });

      expect(foreign.statusCode).toBe(404);
      expect(foreign.statusCode).toBe(missing.statusCode);
      expect(shape(foreign.json(), id)).toEqual(shape(missing.json(), 'does-not-exist'));
      expect(foreign.body).not.toContain('tenant-1');
    },
  );

  it.each(reads)('answers 404 for $name when the tenant header is missing', async ({ suffix }) => {
    const id = await createFor('tenant-1');
    const res = await app.inject({
      method: 'GET',
      url: `/internal/analyses/${id}${suffix}`,
      headers: auth,
    });
    expect(res.statusCode).toBe(404);
  });

  it('keeps each tenant able to read its own analysis', async () => {
    const first = await createFor('tenant-1');
    const second = await createFor('tenant-2');
    const read = (id: string, tenantId: string) =>
      app.inject({ method: 'GET', url: `/internal/analyses/${id}`, headers: asTenant(tenantId) });

    expect((await read(first, 'tenant-1')).statusCode).toBe(200);
    expect((await read(second, 'tenant-2')).statusCode).toBe(200);
    expect((await read(first, 'tenant-2')).statusCode).toBe(404);
    expect((await read(second, 'tenant-1')).statusCode).toBe(404);
  });
});
