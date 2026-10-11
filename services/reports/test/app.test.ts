import { type CreateAnalysisJob, HEADERS, PLAN_CATALOG, Report } from '@gyde/contracts';
import { sampleAnalysisRequest, sampleVulnerabilityFinding } from '@gyde/contracts/samples';
import { createLogger } from '@gyde/service-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@gyde/service-kit';

import type { AppModuleOverrides } from '../src/app.module';
import type { ReportRepository, StoredAnalysis } from '../src/application/ports/report-repository';
import type { RetrievalClient } from '../src/application/ports/retrieval-client';
import { configSchema } from '../src/config';
import { createApp } from '../src/http/app';

const token = 'test-internal-token-123456';
const config = configSchema.parse({ INTERNAL_SERVICE_TOKEN: token });
const auth = { [HEADERS.internalToken]: token };

/** Fake repository: records every call so the tests can assert on it. */
class FakeRepository implements ReportRepository {
  readonly store = new Map<string, StoredAnalysis>();
  readonly calls: string[] = [];

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
    this.calls.push(`update:${analysis.id}`);
    this.store.set(analysis.id, structuredClone(analysis));
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

async function buildApp(overrides: AppModuleOverrides = {}): Promise<NestFastifyApplication> {
  return createApp({
    config,
    logger: createLogger({ name: 'reports-test', level: 'silent' }),
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
      headers: auth,
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
    schedule?: (fn: () => void, ms: number) => void,
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
      headers: auth,
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
      headers: auth,
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
    const immediateSchedule = (fn: () => void, _ms: number) => {
      void Promise.resolve().then(fn);
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
      headers: auth,
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
      headers: auth,
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
      headers: auth,
    });

    expect(getRes.statusCode).toBe(200);
    expect(getRes.headers['content-type']).toContain('text/markdown');
    expect(getRes.body).toContain(analysisId);
    // The analysis is still 'retrieving' so no findings section with actual content,
    // but the title and status must be there.
    expect(getRes.body).toContain('Reporte de análisis');

    await app.close();
  });

  it.todo('reports are stored and read back from the reports schema in PostgreSQL');
});
