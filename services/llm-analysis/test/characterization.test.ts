import type { InternalLlmConfig } from '@gyde/contracts';
import { sampleLicenseFinding, sampleVulnerabilityFinding } from '@gyde/contracts/samples';
import { createLogger } from '@gyde/service-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppModuleOverrides } from '../src/app.module';
import { BackgroundJobs } from '../src/application/background-jobs';
import { configSchema } from '../src/config';
import { createApp } from '../src/http/app';
import { FakeServices, HOSTS, analysisPayload } from './support/fake-services';

/**
 * Characterization of what llm-analysis publishes to Reports and sends to the model, written
 * BEFORE the Clean Architecture refactor and kept unchanged by it. It complements `app.test.ts`:
 * exact bodies, exact messages, exact prompts.
 */

const token = 'test-internal-token-123456';
const apiKey = 'sk-test-key-1234567890';
const ANTHROPIC = 'https://api.anthropic.com';

const open: Awaited<ReturnType<typeof createApp>>[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
});

const testBreakers = {
  failureThreshold: 2,
  failureRate: 2,
  minCalls: 5,
  openTimeoutMs: 60_000,
} as const;

type Interceptor = (url: URL, init: RequestInit | undefined) => Response | undefined;

function tenantConfig(overrides: Partial<InternalLlmConfig> = {}): InternalLlmConfig {
  return {
    tenantId: 'tenant-1',
    provider: 'anthropic',
    model: 'claude-test',
    apiKey,
    ...overrides,
  };
}

async function start(
  options: {
    services?: FakeServices;
    intercept?: Interceptor;
    module?: AppModuleOverrides;
  } = {},
) {
  const services = options.services ?? new FakeServices(token);
  const logs: string[] = [];
  const errors: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const intercepted = options.intercept?.(new URL(String(input)), init);
    return intercepted ?? services.fetch(input, init);
  };
  const config = configSchema.parse({
    INTERNAL_SERVICE_TOKEN: token,
    WEB_URL: HOSTS.web,
    REPORTS_URL: HOSTS.reports,
  });
  const app = await createApp({
    config,
    logger: createLogger({
      name: 'llm-char',
      level: 'trace',
      destination: { write: (chunk: string) => void logs.push(chunk) },
    }),
    module: { fetch: fetchImpl, breakerOptions: testBreakers, ...options.module },
  });
  open.push(app);
  const jobs = app.get(BackgroundJobs);
  const run = async (payload = analysisPayload()) => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/analyze',
      headers: { 'x-internal-token': token },
      payload,
    });
    await jobs.idle();
    return res;
  };
  return { app, services, logs, errors, run };
}

/** Anthropic answers `text` as the model's text block. */
const anthropicSays =
  (text: string): Interceptor =>
  (url) =>
    url.origin === ANTHROPIC ? Response.json({ content: [{ type: 'text', text }] }) : undefined;

function withKey(): FakeServices {
  const services = new FakeServices(token);
  services.setConfig('tenant-1', tenantConfig());
  return services;
}

const SYSTEM_PROMPT = [
  'You are the analysis engine of Gyde, a platform that detects vulnerabilities, license conflicts',
  'and compatibility risks in video game projects (Unity and Unreal Engine).',
  'You receive the deterministic findings of one analysis, together with their evidence and the',
  'technical context of the project. Correlate them and explain, in plain language and for a game',
  'developer, why each finding matters and what to do about it.',
  'Answer with ONLY one JSON object, no prose and no code fences, with this exact shape:',
  '{"summary": string (optional, at most 4000 characters), "explanations": [{"id": string, "aiExplanation": string (at most 4000 characters)}]}',
  'Include one entry per finding, ordered from the most urgent to the least urgent: the order of',
  '"explanations" IS the priority of the report. Use each finding id verbatim.',
  'Never invent findings, ids, severities, versions or facts that are not in the input.',
].join(' ');

describe('the AiResult published to Reports', () => {
  it('has exactly the merged findings, the summary and nothing else', async () => {
    const services = withKey();
    const { run } = await start({ services });
    const payload = analysisPayload();

    await run(payload);

    const byId = new Map(payload.findings.map((finding) => [finding.id, finding]));
    expect(services.aiResults).toEqual([
      {
        analysisId: 'analysis-1',
        summary: 'Mocked model summary.',
        findings: [
          {
            ...byId.get('finding-license-0001'),
            aiExplanation: 'Model explanation 1 for finding-license-0001.',
          },
          {
            ...byId.get('finding-vuln-0001'),
            aiExplanation: 'Model explanation 2 for finding-vuln-0001.',
          },
        ],
      },
    ]);
    expect(services.failures).toEqual([]);
    const body = services.callsTo('reports')[0]?.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['analysisId', 'findings', 'summary']);
  });

  it('omits the summary when the model sends none, and keeps unexplained findings last', async () => {
    const services = withKey();
    const payload = analysisPayload();
    const text = JSON.stringify({
      explanations: [{ id: 'finding-vuln-0001', aiExplanation: 'Only this one.' }],
    });
    const { run } = await start({ services, intercept: anthropicSays(text) });

    await run(payload);

    const body = services.callsTo('reports')[0]?.body as Record<string, unknown>;
    expect(body).not.toHaveProperty('summary');
    expect(services.aiResults[0]?.findings.map((f) => [f.id, f.aiExplanation])).toEqual([
      ['finding-vuln-0001', 'Only this one.'],
      ['finding-license-0001', sampleLicenseFinding.aiExplanation],
    ]);
  });

  it('accepts a model answer wrapped in code fences', async () => {
    const services = withKey();
    const text = `\`\`\`json\n${JSON.stringify({
      summary: 'Fenced.',
      explanations: [{ id: 'finding-vuln-0001', aiExplanation: 'Ok.' }],
    })}\n\`\`\``;
    const { run } = await start({ services, intercept: anthropicSays(text) });

    await run();

    expect(services.failures).toEqual([]);
    expect(services.aiResults[0]?.summary).toBe('Fenced.');
  });
});

describe('the prompts sent to the model', () => {
  it('sends the system prompt and the user message byte for byte (Anthropic)', async () => {
    const services = withKey();
    const { run } = await start({ services });
    const payload = analysisPayload();

    await run(payload);

    const [sent] = services.anthropicBodies;
    expect(sent?.system).toBe(SYSTEM_PROMPT);
    expect(sent?.user).toBe(
      JSON.stringify({
        analysisId: payload.analysisId,
        project: payload.project,
        findings: payload.findings,
        evidence: payload.evidence,
      }),
    );
    // The tenant is not data for the model.
    expect(sent?.user).not.toContain('tenantId');
    const request = services.callsTo('anthropic')[0]?.body as Record<string, unknown>;
    expect(request).toMatchObject({ model: 'claude-test', max_tokens: 4096 });
  });

  it('sends the same prompts to Gemini, with the key in a header and not in the URL', async () => {
    const services = new FakeServices(token);
    services.setConfig(
      'tenant-1',
      tenantConfig({
        provider: 'gemini',
        model: 'gemini-test-flash',
        apiKey: 'AIza-gemini-key-0123456789',
      }),
    );
    const seen: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
    const intercept: Interceptor = (url, init) => {
      if (url.origin !== 'https://generativelanguage.googleapis.com') return undefined;
      seen.push({
        url: url.toString(),
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      const ids = [sampleVulnerabilityFinding.id];
      const text = JSON.stringify({
        explanations: ids.map((id) => ({ id, aiExplanation: 'Gemini says.' })),
      });
      return Response.json({ candidates: [{ content: { parts: [{ text }] } }] });
    };
    const { run } = await start({ services, intercept });
    const payload = analysisPayload();

    await run(payload);

    expect(services.failures).toEqual([]);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test-flash:generateContent',
    );
    expect(seen[0]?.url).not.toContain('AIza');
    expect(seen[0]?.headers.get('x-goog-api-key')).toBe('AIza-gemini-key-0123456789');
    expect(seen[0]?.body).toEqual({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: JSON.stringify({
                analysisId: payload.analysisId,
                project: payload.project,
                findings: payload.findings,
                evidence: payload.evidence,
              }),
            },
          ],
        },
      ],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096 },
    });
  });
});

describe('the messages of AnalysisFailure', () => {
  async function failureFor(text: string) {
    const services = withKey();
    const { run } = await start({ services, intercept: anthropicSays(text) });
    await run();
    expect(services.aiResults).toEqual([]);
    expect(services.failures).toHaveLength(1);
    return services.failures[0]!;
  }

  it('free text is llm-error with the JSON parser message', async () => {
    const failure = await failureFor('You should upgrade everything.');
    expect(failure).toMatchObject({ analysisId: 'analysis-1', stage: 'llm', reason: 'llm-error' });
    expect(failure.message).toMatch(/^SyntaxError: /);
  });

  it('an unknown finding id is llm-error with the merge message', async () => {
    const failure = await failureFor(
      JSON.stringify({ explanations: [{ id: 'ghost-finding', aiExplanation: 'x' }] }),
    );
    expect(failure.reason).toBe('llm-error');
    expect(failure.message).toBe(
      'Error: The model explained an unknown or duplicated finding "ghost-finding"',
    );
  });

  it('a duplicated finding id is llm-error with the same merge message', async () => {
    const failure = await failureFor(
      JSON.stringify({
        explanations: [
          { id: 'finding-vuln-0001', aiExplanation: 'a' },
          { id: 'finding-vuln-0001', aiExplanation: 'b' },
        ],
      }),
    );
    expect(failure.message).toBe(
      'Error: The model explained an unknown or duplicated finding "finding-vuln-0001"',
    );
  });

  it.each([
    ['an unknown field', { explanations: [], extra: true }],
    ['an empty explanation', { explanations: [{ id: 'finding-vuln-0001', aiExplanation: '' }] }],
    [
      'an explanation over 4000 characters',
      { explanations: [{ id: 'finding-vuln-0001', aiExplanation: 'x'.repeat(4001) }] },
    ],
    ['a summary over 4000 characters', { summary: 'x'.repeat(4001), explanations: [] }],
    ['no explanations list', { summary: 'only a summary' }],
  ])('%s is llm-error with a ZodError message', async (_name, payload) => {
    const failure = await failureFor(JSON.stringify(payload));
    expect(failure.reason).toBe('llm-error');
    expect(failure.message).toMatch(/^ZodError: /);
    expect(failure.message.length).toBeLessThanOrEqual(1000);
  });

  it('truncates long messages to 1000 characters and redacts the key', async () => {
    const services = withKey();
    const long = `${apiKey} ${'y'.repeat(2000)}`;
    const failing = {
      analyze: () => Promise.reject(new Error(long)),
    };
    const { run } = await start({ services, module: { analyzer: failing } });

    await run();

    const [failure] = services.failures;
    expect(failure?.reason).toBe('llm-error');
    expect(failure?.message).toHaveLength(1000);
    expect(failure?.message.endsWith('…')).toBe(true);
    expect(failure?.message.startsWith('Error: [REDACTED] yyy')).toBe(true);
    expect(failure?.message).not.toContain(apiKey);
  });

  it('an open circuit says so, and its message carries no key', async () => {
    const services = withKey();
    services.failingKeys.add(apiKey);
    const { run } = await start({ services });

    await run(analysisPayload({ analysisId: 'a-1' }));
    await run(analysisPayload({ analysisId: 'a-2' }));
    await run(analysisPayload({ analysisId: 'a-3' }));

    expect(services.failures.map((f) => [f.analysisId, f.reason, f.message])).toEqual([
      ['a-1', 'llm-error', 'Error: Anthropic answered 401'],
      ['a-2', 'llm-unavailable', 'Error: Anthropic answered 401'],
      ['a-3', 'llm-unavailable', 'LLM provider circuit breaker is open'],
    ]);
  });
});

describe('the tenant configuration', () => {
  it('Web failing is llm-unavailable with the status in the message', async () => {
    const services = withKey();
    const intercept: Interceptor = (url) =>
      url.origin === HOSTS.web ? new Response('{}', { status: 500 }) : undefined;
    const { run } = await start({ services, intercept });

    await run();

    expect(services.anthropicBodies).toEqual([]);
    expect(services.failures).toHaveLength(1);
    expect(services.failures[0]).toMatchObject({
      analysisId: 'analysis-1',
      stage: 'llm',
      reason: 'llm-unavailable',
    });
    // The resilient client throws before the adapter sees a 5xx.
    expect(services.failures[0]?.message).toBe(
      'Tenant LLM configuration is unavailable: UpstreamServiceError: Upstream service web returned error 500',
    );
  });

  it('an invalid configuration from Web is reported without echoing its body', async () => {
    const services = withKey();
    const secret = 'sk-leaky-body-0123456789';
    const intercept: Interceptor = (url) =>
      url.origin === HOSTS.web
        ? Response.json({ tenantId: 'tenant-1', provider: 'nope', model: 'm', apiKey: secret })
        : undefined;
    const { run } = await start({ services, intercept });

    await run();

    expect(services.failures[0]?.reason).toBe('llm-unavailable');
    expect(services.failures[0]?.message).toMatch(
      /Web answered an invalid LLM configuration for \/internal\/tenants\/tenant-1\/llm-config$/,
    );
    expect(JSON.stringify(services.failures)).not.toContain(secret);
  });
});

describe('the fallback cache of the open circuit', () => {
  it('is keyed by tenant, provider and findings + evidence, and serves with the new analysisId', async () => {
    const services = new FakeServices(token);
    services.setConfig('tenant-1', tenantConfig({ apiKey: 'key-tenant-one' }));
    services.setConfig(
      'tenant-2',
      tenantConfig({ tenantId: 'tenant-2', apiKey: 'key-tenant-two' }),
    );
    const { run } = await start({ services });

    await run(analysisPayload({ analysisId: 'a-ok', tenantId: 'tenant-1' })); // caches for tenant-1
    services.failingKeys.add('key-tenant-one');
    services.failingKeys.add('key-tenant-two');
    for (const id of ['a-f1', 'a-f2']) {
      await run(analysisPayload({ analysisId: id, tenantId: 'tenant-1' }));
      await run(analysisPayload({ analysisId: `${id}-t2`, tenantId: 'tenant-2' }));
    }
    const before = services.aiResults.length;

    // tenant-1, open circuit, same findings + evidence: served from the cache.
    await run(analysisPayload({ analysisId: 'a-served', tenantId: 'tenant-1' }));
    expect(services.aiResults.at(-1)).toMatchObject({ analysisId: 'a-served' });
    expect(services.aiResults).toHaveLength(before + 1);
    expect(services.aiResults.at(-1)?.findings).toEqual(services.aiResults[0]?.findings);

    // Same findings, different evidence: nothing to serve.
    await run(analysisPayload({ analysisId: 'a-evidence', tenantId: 'tenant-1', evidence: [] }));
    expect(services.failures.at(-1)).toMatchObject({
      analysisId: 'a-evidence',
      reason: 'llm-unavailable',
      message: 'LLM provider circuit breaker is open',
    });

    // Another tenant never receives tenant-1's classification.
    await run(analysisPayload({ analysisId: 'a-other', tenantId: 'tenant-2' }));
    expect(services.failures.at(-1)).toMatchObject({
      analysisId: 'a-other',
      reason: 'llm-unavailable',
    });
    expect(services.aiResults.map((r) => r.analysisId)).toEqual(['a-ok', 'a-served']);
  });
});

describe('the mock provider breaker key', () => {
  it('uses its own tenant:mock breaker, which opens like any other', async () => {
    const services = new FakeServices(token);
    const failing = { analyze: () => Promise.reject(new Error('mock down')) };
    // Mock is only enabled with LLM_MOCK_ENABLED, set through the config of this test.
    const mockApp = await createApp({
      config: configSchema.parse({
        INTERNAL_SERVICE_TOKEN: token,
        WEB_URL: HOSTS.web,
        REPORTS_URL: HOSTS.reports,
        LLM_MOCK_ENABLED: 'true',
      }),
      logger: createLogger({ name: 'llm-char', level: 'silent' }),
      module: { fetch: services.fetch, breakerOptions: testBreakers, mockAnalyzer: failing },
    });
    open.push(mockApp);
    const jobs = mockApp.get(BackgroundJobs);
    const go = async (analysisId: string) => {
      await mockApp.inject({
        method: 'POST',
        url: '/internal/analyze',
        headers: { 'x-internal-token': token },
        payload: analysisPayload({ analysisId }),
      });
      await jobs.idle();
    };

    await go('m-1');
    await go('m-2');
    await go('m-3');

    expect(services.failures.map((f) => [f.analysisId, f.reason])).toEqual([
      ['m-1', 'llm-error'],
      ['m-2', 'llm-unavailable'],
      ['m-3', 'llm-unavailable'],
    ]);
  });
});

describe('the delivery to Reports', () => {
  it('a Reports failure on the AI result becomes a published llm-error and never throws', async () => {
    const services = withKey();
    let failedOnce = false;
    const intercept: Interceptor = (url) => {
      if (url.origin === HOSTS.reports && url.pathname.endsWith('/ai-result') && !failedOnce) {
        failedOnce = true;
        return new Response('{}', { status: 500 });
      }
      return undefined;
    };
    const { run } = await start({ services, intercept });

    const res = await run();

    expect(res.statusCode).toBe(202);
    expect(services.aiResults).toEqual([]);
    expect(services.failures).toHaveLength(1);
    expect(services.failures[0]).toMatchObject({
      analysisId: 'analysis-1',
      stage: 'llm',
      reason: 'llm-error',
    });
  });

  it('when Reports is down for the failure too, the error is swallowed and the app keeps serving', async () => {
    const services = withKey();
    services.anthropicBehavior = 'error500';
    const intercept: Interceptor = (url) =>
      url.origin === HOSTS.reports ? new Response('{}', { status: 500 }) : undefined;
    const { run } = await start({ services, intercept });

    const res = await run();

    expect(res.statusCode).toBe(202);
    expect(services.failures).toEqual([]);
    expect((await run(analysisPayload({ analysisId: 'analysis-2' }))).statusCode).toBe(202);
  });
});

describe('the lifetime of the breaker', () => {
  it('stays open between calls and recovers (half-open, then closed) after openTimeoutMs', async () => {
    const services = withKey();
    services.failingKeys.add(apiKey);
    const { run } = await start({
      services,
      module: { breakerOptions: { ...testBreakers, openTimeoutMs: 150 } },
    });

    await run(analysisPayload({ analysisId: 'a-1' }));
    await run(analysisPayload({ analysisId: 'a-2' })); // opens
    const callsWhenOpen = services.callsTo('anthropic').length;
    await run(analysisPayload({ analysisId: 'a-3' }));
    await run(analysisPayload({ analysisId: 'a-4' }));
    // The same breaker answered both: the provider was never called while it was open.
    expect(services.callsTo('anthropic')).toHaveLength(callsWhenOpen);
    expect(services.failures.slice(-2).map((f) => f.reason)).toEqual([
      'llm-unavailable',
      'llm-unavailable',
    ]);

    // The key is fixed and the open window passes: the trial call goes out and closes it.
    services.failingKeys.delete(apiKey);
    await new Promise((resolve) => setTimeout(resolve, 250));
    await run(analysisPayload({ analysisId: 'a-5' }));
    expect(services.callsTo('anthropic')).toHaveLength(callsWhenOpen + 1);
    expect(services.aiResults.map((r) => r.analysisId)).toEqual(['a-5']);
  });
});
