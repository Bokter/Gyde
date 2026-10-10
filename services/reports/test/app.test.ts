import { HEADERS, PLAN_CATALOG, Report } from '@gyde/contracts';
import { sampleAnalysisRequest } from '@gyde/contracts/samples';
import { createLogger } from '@gyde/service-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@gyde/service-kit';

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

async function buildApp(overrides: {
  repository?: ReportRepository;
  retrieval?: RetrievalClient;
}): Promise<NestFastifyApplication> {
  return createApp({
    config,
    logger: createLogger({ name: 'reports-test', level: 'silent' }),
    overrides,
  });
}

function jobPayload() {
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

/** Acceptance criteria for Area 4. Turn each `it.todo` into a real test as you build it. */
describe('reports behavior still to implement', () => {
  it.todo('recordDeterministic moves the job to analyzing when AI is expected, ready otherwise');
  it.todo('recordAi moves the job to ready and the report includes the AI explanations');
  it.todo('an llm failure makes the report ready and degraded with the reason (never failed)');
  it.todo('a retrieval failure makes the report failed with a clear error');
  it.todo('a report whose AI result never arrives becomes degraded after REPORTS_AI_TIMEOUT_MS');
  it.todo('a report is NOT degraded when AI was not expected (plan or client option)');
  it.todo('GET /internal/analyses/:id/markdown returns the rendered Markdown');
  it.todo('reports are stored and read back from the reports schema in PostgreSQL');
});
