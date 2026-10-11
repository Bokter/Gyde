import { HEADERS, type InternalLlmConfig } from '@gyde/contracts';
import { sampleVulnerabilityFinding } from '@gyde/contracts/samples';
import { createLogger } from '@gyde/service-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackgroundJobs } from '../src/application/background-jobs';
import type { AppModuleOverrides } from '../src/app.module';
import { configSchema } from '../src/config';
import { createApp } from '../src/http/app';
import { FakeServices, HOSTS, analysisPayload } from './support/fake-services';

const token = 'test-internal-token-123456';
const apiKey = 'sk-test-key-1234567890';
const auth = { [HEADERS.internalToken]: token };

const open: Awaited<ReturnType<typeof createApp>>[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
});

/** Only the "2 failures in a row" rule opens a circuit in these tests. */
const testBreakers = {
  failureThreshold: 2,
  failureRate: 2,
  minCalls: 5,
  openTimeoutMs: 60_000,
} as const;

/** An llm-analysis wired to fake Web, Reports and Anthropic (the real HTTP adapters). */
async function start(
  options: { services?: FakeServices; mockEnabled?: boolean; module?: AppModuleOverrides } = {},
) {
  const services = options.services ?? new FakeServices(token);
  const logs: string[] = [];
  const destination = {
    write: (chunk: string) => {
      logs.push(chunk);
    },
  };
  const config = configSchema.parse({
    INTERNAL_SERVICE_TOKEN: token,
    WEB_URL: HOSTS.web,
    REPORTS_URL: HOSTS.reports,
    ...(options.mockEnabled && { LLM_MOCK_ENABLED: 'true' }),
  });
  const app = await createApp({
    config,
    logger: createLogger({ name: 'llm-test', level: 'trace', destination }),
    module: { fetch: services.fetch, breakerOptions: testBreakers, ...options.module },
  });
  open.push(app);
  const jobs = app.get(BackgroundJobs);

  const analyze = (payload = analysisPayload()) =>
    app.inject({ method: 'POST', url: '/internal/analyze', headers: auth, payload });
  const run = async (payload = analysisPayload()) => {
    const res = await analyze(payload);
    await jobs.idle();
    return res;
  };
  return { app, services, logs, jobs, analyze, run };
}

function tenantConfig(overrides: Partial<InternalLlmConfig> = {}): InternalLlmConfig {
  return {
    tenantId: 'tenant-1',
    provider: 'anthropic',
    model: 'claude-test',
    apiKey,
    ...overrides,
  };
}

describe('llm-analysis HTTP surface', () => {
  it('is alive and does not use the mock provider unless asked to', async () => {
    const { app } = await start();
    expect((await app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
    expect(configSchema.parse({ INTERNAL_SERVICE_TOKEN: token }).LLM_MOCK_ENABLED).toBe(false);
  });

  it('refuses /internal calls without the token', async () => {
    const { app } = await start();
    const res = await app.inject({ method: 'POST', url: '/internal/analyze', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('validates the analysis request and answers 202 at once', async () => {
    const { run } = await start();

    const invalid = await run({ nope: true } as never);
    expect(invalid.statusCode).toBe(400);

    const valid = await run();
    expect(valid.statusCode).toBe(202);
    expect(valid.json()).toEqual({ analysisId: 'analysis-1', status: 'analyzing' });
  });
});

describe('the tenant LLM configuration (BYOK)', () => {
  it('publishes AnalysisFailure llm-not-configured when the tenant has no LLM key', async () => {
    const { services, run } = await start();

    await run();

    expect(services.aiResults).toEqual([]);
    expect(services.anthropicBodies).toEqual([]);
    expect(services.failures).toEqual([
      {
        analysisId: 'analysis-1',
        stage: 'llm',
        reason: 'llm-not-configured',
        message: expect.stringContaining('has not configured'),
      },
    ]);
  });

  it('fetches the tenant config from the Web internal endpoint and uses it for one call only', async () => {
    const services = new FakeServices(token);
    services.setConfig('tenant-1', tenantConfig());
    const clock = { now: 0 };
    const { run } = await start({ services, module: { now: () => clock.now } });

    await run(analysisPayload({ analysisId: 'analysis-1' }));
    await run(analysisPayload({ analysisId: 'analysis-2' }));

    expect(services.callsTo('web')).toHaveLength(1);
    expect(services.anthropicBodies).toHaveLength(2);
    expect(services.anthropicBodies[0]?.model).toBe('claude-test');

    // The key stays in memory for a minute, and no longer.
    clock.now = 61_000;
    await run(analysisPayload({ analysisId: 'analysis-3' }));
    expect(services.callsTo('web')).toHaveLength(2);
    for (const call of services.calls.filter((c) => c.service !== 'anthropic')) {
      expect(call.token, call.path).toBe(token);
    }
  });

  it('never writes the API key to logs, errors or published messages', async () => {
    const services = new FakeServices(token);
    services.setConfig('tenant-1', tenantConfig({ apiKey: 'sk-super-secret-key-abc123' }));
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const { logs, run } = await start({ services });

    await run(); // the happy path
    services.anthropicBehavior = 'error500';
    await run(analysisPayload({ analysisId: 'analysis-2' })); // llm-error
    await run(analysisPayload({ analysisId: 'analysis-3' })); // the breaker opens
    await run(analysisPayload({ analysisId: 'analysis-4' })); // the circuit is open

    const everything = [
      logs.join(''),
      JSON.stringify(services.calls.map(({ service, path, body }) => ({ service, path, body }))),
      JSON.stringify(services.aiResults),
      JSON.stringify(services.failures),
      ...consoleSpies.flatMap((spy) => spy.mock.calls.flat().map(String)),
    ].join(' ');
    expect(everything).not.toContain('sk-super-secret-key-abc123');
  });
});

describe('the model output is untrusted', () => {
  it('validates the model output with the AiResult schema and rejects free text', async () => {
    const services = new FakeServices(token);
    services.setConfig('tenant-1', tenantConfig());
    services.anthropicBehavior = 'freeText';
    const { run } = await start({ services });

    await run();

    expect(services.aiResults).toEqual([]);
    expect(services.failures).toEqual([
      expect.objectContaining({ analysisId: 'analysis-1', stage: 'llm', reason: 'llm-error' }),
    ]);
  });

  it('rejects an explanation for a finding that is not in the request', async () => {
    const services = new FakeServices(token);
    services.setConfig('tenant-1', tenantConfig());
    services.anthropicBehavior = 'unknownId';
    const { run } = await start({ services });

    await run();

    expect(services.aiResults).toEqual([]);
    expect(services.failures[0]?.reason).toBe('llm-error');
  });

  it('publishes the merged findings in the model order, with the deterministic facts intact', async () => {
    const services = new FakeServices(token);
    services.setConfig('tenant-1', tenantConfig());
    const { run } = await start({ services });

    await run();

    const [result] = services.aiResults;
    expect(result?.analysisId).toBe('analysis-1');
    expect(result?.summary).toBe('Mocked model summary.');
    // The order of the model is the priority of the report.
    expect(result?.findings.map((f) => f.id)).toEqual([
      'finding-license-0001',
      'finding-vuln-0001',
    ]);
    expect(result?.findings.map((f) => f.aiExplanation)).toEqual([
      'Model explanation 1 for finding-license-0001.',
      'Model explanation 2 for finding-vuln-0001.',
    ]);
    // The model never changes a fact: the severity, the CVSS and the evidence are the engine's.
    expect(result?.findings[1]).toMatchObject({
      title: sampleVulnerabilityFinding.title,
      severity: 'high',
      cvss: 7.5,
      deterministic: true,
      evidence: sampleVulnerabilityFinding.evidence,
    });
  });
});

describe('the circuit breaker is scoped per tenant + provider', () => {
  it('one tenant failing does not open others', async () => {
    const services = new FakeServices(token);
    services.setConfig('tenant-1', tenantConfig({ apiKey: 'key-broken-tenant' }));
    services.setConfig(
      'tenant-2',
      tenantConfig({ tenantId: 'tenant-2', apiKey: 'key-good-tenant' }),
    );
    services.failingKeys.add('key-broken-tenant');
    const { run } = await start({ services });

    await run(analysisPayload({ tenantId: 'tenant-1', analysisId: 'a-broken-1' }));
    await run(analysisPayload({ tenantId: 'tenant-1', analysisId: 'a-broken-2' }));
    await run(analysisPayload({ tenantId: 'tenant-1', analysisId: 'a-broken-3' }));
    await run(analysisPayload({ tenantId: 'tenant-2', analysisId: 'a-good-1' }));

    expect(services.failures.map((f) => [f.analysisId, f.reason])).toEqual([
      ['a-broken-1', 'llm-error'],
      ['a-broken-2', 'llm-unavailable'],
      ['a-broken-3', 'llm-unavailable'],
    ]);
    expect(services.aiResults.map((r) => r.analysisId)).toEqual(['a-good-1']);
  });

  it('publishes llm-unavailable (and serves the last cached result if any) when the circuit is open', async () => {
    const services = new FakeServices(token);
    services.setConfig('tenant-1', tenantConfig());
    const { run } = await start({ services });

    await run(analysisPayload({ analysisId: 'analysis-1' })); // cached
    services.failingKeys.add(apiKey);
    await run(analysisPayload({ analysisId: 'analysis-2' }));
    await run(analysisPayload({ analysisId: 'analysis-3' })); // opens the circuit

    // Same findings fingerprint: the last classification is served instead of calling Anthropic.
    await run(analysisPayload({ analysisId: 'analysis-4' }));
    expect(services.aiResults.map((r) => r.analysisId)).toEqual(['analysis-1', 'analysis-4']);
    expect(services.aiResults[1]?.findings).toEqual(services.aiResults[0]?.findings);

    // Different findings: there is nothing to serve, and the report stays deterministic.
    await run(
      analysisPayload({ analysisId: 'analysis-5', findings: [sampleVulnerabilityFinding] }),
    );
    expect(services.failures.at(-1)).toEqual(
      expect.objectContaining({ analysisId: 'analysis-5', reason: 'llm-unavailable' }),
    );
  });

  it('publishes llm-error when the provider answers with an error', async () => {
    const services = new FakeServices(token);
    services.setConfig('tenant-1', tenantConfig());
    services.anthropicBehavior = 'error500';
    const { run } = await start({ services });

    await run();

    expect(services.aiResults).toEqual([]);
    expect(services.failures).toEqual([
      {
        analysisId: 'analysis-1',
        stage: 'llm',
        reason: 'llm-error',
        message: expect.stringContaining('500'),
      },
    ]);
  });
});

describe('the mock provider', () => {
  it('answers deterministically and only when LLM_MOCK_ENABLED=true', async () => {
    // Without the flag a studio without a key gets a degraded, deterministic report.
    const withoutFlag = await start();
    await withoutFlag.run();
    expect(withoutFlag.services.failures[0]?.reason).toBe('llm-not-configured');
    expect(withoutFlag.services.anthropicBodies).toEqual([]);

    // With the flag and no key the mock answers, and it always answers the same.
    const services = new FakeServices(token);
    const { run } = await start({ services, mockEnabled: true });
    await run(analysisPayload({ analysisId: 'analysis-1' }));
    await run(analysisPayload({ analysisId: 'analysis-2' }));

    const [first, second] = services.aiResults;
    expect(first?.findings).toHaveLength(2);
    for (const finding of first?.findings ?? []) {
      expect(finding.aiExplanation).toContain('Mock explanation');
    }
    expect({ ...first, analysisId: '' }).toEqual({ ...second, analysisId: '' });
    expect(services.anthropicBodies).toEqual([]);

    // A studio WITH a key never sees the mock, even with the flag on.
    services.setConfig('tenant-2', tenantConfig({ tenantId: 'tenant-2' }));
    await run(analysisPayload({ analysisId: 'analysis-3', tenantId: 'tenant-2' }));
    expect(services.anthropicBodies).toHaveLength(1);
  });
});

describe('POST /internal/analyze', () => {
  it('answers 202 at once and finishes in the background', async () => {
    const services = new FakeServices(token);
    services.setConfig('tenant-1', tenantConfig());
    let release!: () => void;
    services.gates.web = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { analyze, jobs } = await start({ services });

    const res = await analyze();

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ analysisId: 'analysis-1', status: 'analyzing' });
    // The answer did not depend on Web, and therefore neither on the provider nor Reports.
    expect(services.aiResults).toEqual([]);
    expect(services.failures).toEqual([]);

    release();
    await jobs.idle();
    expect(services.aiResults).toHaveLength(1);
  });
});
