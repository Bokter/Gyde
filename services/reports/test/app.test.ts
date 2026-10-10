import { HEADERS, PLAN_CATALOG } from '@gyde/contracts';
import { sampleAnalysisRequest } from '@gyde/contracts/samples';
import { createLogger } from '@gyde/service-kit';
import { afterAll, describe, expect, it } from 'vitest';

import { configSchema } from '../src/config';
import { createApp } from '../src/http/app';

const token = 'test-internal-token-123456';
const config = configSchema.parse({ INTERNAL_SERVICE_TOKEN: token });
const app = await createApp({
  config,
  logger: createLogger({ name: 'reports-test', level: 'silent' }),
});
const auth = { [HEADERS.internalToken]: token };

afterAll(() => app.close());

describe('reports skeleton', () => {
  it('is alive', async () => {
    expect((await app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
  });

  it('refuses /internal calls without the token', async () => {
    const res = await app.inject({ method: 'GET', url: '/internal/analyses/analysis-1' });
    expect(res.statusCode).toBe(401);
  });

  it('validates the job body and answers 501 until implemented', async () => {
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
      payload: {
        tenantId: 'tenant-1',
        entitlements: PLAN_CATALOG.pro,
        request: sampleAnalysisRequest,
      },
    });
    expect(valid.statusCode).toBe(501);
  });
});

/** Acceptance criteria for Area 4. Turn each `it.todo` into a real test as you build it. */
describe('reports behavior still to implement', () => {
  it.todo('POST /internal/analyses creates the job, calls Retrieval and answers 202 with the id');
  it.todo('recordDeterministic moves the job to analyzing when AI is expected, ready otherwise');
  it.todo('recordAi moves the job to ready and the report includes the AI explanations');
  it.todo('an llm failure makes the report ready and degraded with the reason (never failed)');
  it.todo('a retrieval failure makes the report failed with a clear error');
  it.todo('a report whose AI result never arrives becomes degraded after REPORTS_AI_TIMEOUT_MS');
  it.todo('a report is NOT degraded when AI was not expected (plan or client option)');
  it.todo('GET /internal/analyses/:id returns a Report valid against the contract schema');
  it.todo('GET /internal/analyses/:id/markdown returns the rendered Markdown');
  it.todo('reports are stored and read back from the reports schema in PostgreSQL');
});
