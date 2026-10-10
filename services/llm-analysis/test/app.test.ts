import { HEADERS } from '@gyde/contracts';
import { sampleAnalysisRequest, sampleVulnerabilityFinding } from '@gyde/contracts/samples';
import { createLogger } from '@gyde/service-kit';
import { afterAll, describe, expect, it } from 'vitest';

import { configSchema } from '../src/config';
import { createApp } from '../src/http/app';

const token = 'test-internal-token-123456';
const config = configSchema.parse({ INTERNAL_SERVICE_TOKEN: token });
const app = await createApp({
  config,
  logger: createLogger({ name: 'llm-test', level: 'silent' }),
});
const auth = { [HEADERS.internalToken]: token };

afterAll(() => app.close());

describe('llm-analysis skeleton', () => {
  it('is alive and does not use the mock provider unless asked to', async () => {
    expect((await app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
    expect(config.LLM_MOCK_ENABLED).toBe(false);
  });

  it('refuses /internal calls without the token', async () => {
    const res = await app.inject({ method: 'POST', url: '/internal/analyze', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('validates the analysis request and answers 501 until implemented', async () => {
    const invalid = await app.inject({
      method: 'POST',
      url: '/internal/analyze',
      headers: auth,
      payload: { nope: true },
    });
    expect(invalid.statusCode).toBe(400);

    const valid = await app.inject({
      method: 'POST',
      url: '/internal/analyze',
      headers: auth,
      payload: {
        analysisId: 'analysis-1',
        tenantId: 'tenant-1',
        project: sampleAnalysisRequest.project,
        findings: [sampleVulnerabilityFinding],
        evidence: sampleVulnerabilityFinding.evidence,
      },
    });
    expect(valid.statusCode).toBe(501);
  });
});

/** Acceptance criteria for Area 4. Turn each `it.todo` into a real test as you build it. */
describe('llm-analysis behavior still to implement', () => {
  it.todo('publishes AnalysisFailure llm-not-configured when the tenant has no LLM key');
  it.todo('fetches the tenant config from the Web internal endpoint and uses it for one call only');
  it.todo('never writes the API key to logs, errors or published messages');
  it.todo('validates the model output with the AiResult schema and rejects free text');
  it.todo(
    'the circuit breaker is scoped per tenant + provider: one tenant failing does not open others',
  );
  it.todo(
    'publishes llm-unavailable (and serves the last cached result if any) when the circuit is open',
  );
  it.todo('publishes llm-error when the provider answers with an error');
  it.todo('the mock provider answers deterministically and only when LLM_MOCK_ENABLED=true');
  it.todo('POST /internal/analyze answers 202 at once and finishes in the background');
});
