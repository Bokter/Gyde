import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { HTTP_STATUS_BY_CODE, PLAN_CATALOG } from '@gyde/contracts';
import type { AuthVerifyResponse, Report } from '@gyde/contracts';
import { sampleAnalysisRequest, sampleReportReady } from '@gyde/contracts/samples';
import { CircuitBreaker, createBreakerFromEnv, MemoryFallbackCache } from '@gyde/resilience';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CppDependencyParser, CsharpDependencyParser, GydeApiClient, GydeApiError } from '../src';

const PROJECTS = resolve(import.meta.dirname, '../../../fixtures/projects');
const UNITY_SAMPLE = resolve(PROJECTS, 'unity-sample');
const EXPECTED_PARSE = resolve(UNITY_SAMPLE, 'expected-parse.json');
const UNREAL_SAMPLE = resolve(PROJECTS, 'unreal-sample');
const UNREAL_EXPECTED_PARSE = resolve(UNREAL_SAMPLE, 'expected-parse.json');

/**
 * Executable acceptance criteria for the Area 4 work in this package. Turn each `it.todo` into a
 * real test as you implement it. Use the samples of @gyde/contracts and fixtures/ for data.
 */
describe('parsers (use fixtures/projects)', () => {
  const parser = new CsharpDependencyParser(UNITY_SAMPLE);

  it('CsharpDependencyParser reads UPM packages from Packages/manifest.json', async () => {
    const result = await parser.parseDependencies();
    const upm = result.dependencies.filter((d) => d.ecosystem === 'upm');
    expect(upm).toEqual([
      {
        ecosystem: 'upm',
        name: 'com.unity.render-pipelines.universal',
        version: '14.0.9',
        direct: true,
      },
    ]);
  });

  it('CsharpDependencyParser reads NuGet packages from .csproj / packages.config', async () => {
    const result = await parser.parseDependencies();
    const nuget = result.dependencies.filter((d) => d.ecosystem === 'nuget');
    expect(nuget).toEqual([
      {
        ecosystem: 'nuget',
        name: 'Acme.GplToolkit',
        version: '2.1.0',
        declaredLicense: 'GPL-3.0-only',
        direct: true,
      },
      {
        ecosystem: 'nuget',
        name: 'Acme.Serialization',
        version: '1.4.0',
        declaredLicense: 'MIT',
        direct: true,
      },
    ]);
  });

  it('CsharpDependencyParser reads the editor version from ProjectVersion.txt', async () => {
    const result = await parser.parseDependencies();
    expect(result.project.gameEngine).toBe('unity');
    expect(result.project.gameEngineVersion).toBe('2022.3.20f1');
  });

  it('CsharpDependencyParser output matches expected-parse.json exactly', async () => {
    const result = await parser.parseDependencies();
    const expected = JSON.parse(readFileSync(EXPECTED_PARSE, 'utf-8'));
    expect(result).toEqual(expected);
  });

  it('CppDependencyParser reads plugins from the .uproject and modules from *.Build.cs', async () => {
    const result = await new CppDependencyParser(UNREAL_SAMPLE).parseDependencies();

    expect(result.project).toEqual({
      gameEngine: 'unreal',
      gameEngineVersion: '5.3',
      sdks: [],
      platforms: [],
    });
    const unreal = result.dependencies.filter((dependency) => dependency.ecosystem === 'unreal');
    expect(unreal.map((dependency) => dependency.name)).toEqual([
      'Core',
      'CoreUObject',
      'Engine',
      'InputCore',
      'Niagara',
      'OnlineSubsystemSteam',
      'Slate',
      'SlateCore',
    ]);
    // Engine plugins and modules all carry the engine version, and the game's own module is not a dependency.
    expect(unreal.every((dependency) => dependency.version === '5.3' && dependency.direct)).toBe(
      true,
    );
    expect(unreal.map((dependency) => dependency.name)).not.toContain('SampleGame');
  });

  it('CppDependencyParser reads vcpkg.json / conanfile.txt when present', async () => {
    const result = await new CppDependencyParser(UNREAL_SAMPLE).parseDependencies();
    expect(result.dependencies.filter((dependency) => dependency.ecosystem === 'cpp')).toEqual([
      { ecosystem: 'cpp', name: 'acme-samplelib', version: '1.1.0', direct: true },
    ]);

    // conanfile.txt is not part of the fixture: a temp project covers its [requires] section.
    const root = await mkdtemp(join(tmpdir(), 'gyde-cpp-'));
    try {
      await writeFile(
        join(root, 'Sample.uproject'),
        JSON.stringify({ EngineAssociation: '5.4', Modules: [{ Name: 'Sample' }] }),
      );
      await writeFile(
        join(root, 'conanfile.txt'),
        '[requires]\nfmt/10.1.0\nzlib\n\n[generators]\nCMakeDeps\n',
      );

      const conan = await new CppDependencyParser(root).parseDependencies();
      expect(conan.dependencies).toEqual([
        { ecosystem: 'cpp', name: 'fmt', version: '10.1.0', direct: true },
        { ecosystem: 'cpp', name: 'zlib', version: 'unknown', direct: true },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('CppDependencyParser output matches expected-parse.json exactly', async () => {
    const result = await new CppDependencyParser(UNREAL_SAMPLE).parseDependencies();
    const expected = JSON.parse(readFileSync(UNREAL_EXPECTED_PARSE, 'utf-8'));
    expect(result).toEqual(expected);
  });

  it('parsers never read or return source code, only names, versions and licenses', async () => {
    const unity = await parser.parseDependencies();
    const unityWire = JSON.stringify(unity);
    expect(unityWire).not.toContain('PROPRIETARY_MARKER_DO_NOT_SEND');
    expect(unityWire).not.toContain('Assets/Scripts');
    expect(unityWire).not.toContain('Player.cs');
    expect(unityWire).not.toContain('transform.Translate');

    const unreal = await new CppDependencyParser(UNREAL_SAMPLE).parseDependencies();
    const unrealWire = JSON.stringify(unreal);
    expect(unrealWire).not.toContain('#include');
    expect(unrealWire).not.toContain('ModuleRules');
    expect(unrealWire).not.toContain('UnrealBuildTool');
    expect(unrealWire).not.toContain('SampleGame.Build.cs');
    expect(unrealWire).not.toContain('Source/SampleGame');
  });
});

// The pipeline steps (analyzeLicenses, generateReport, LocalCLIPipeline output) are covered in
// `pipeline-steps.test.ts`. The pull request comment of the GitHub Action is not tested here: it
// belongs to `apps/github-action` (`PullRequestCommentPipeline`, tested in its `test/run.test.ts`).

describe('GydeApiClient', () => {
  const API_URL = 'http://gateway.test';
  const API_KEY = 'gyde_test_secret_key_do_not_log';

  /** Minimal Response factory so tests never need a real HTTP server. */
  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  function authVerifyResponse(): AuthVerifyResponse {
    return { plan: 'pro', entitlements: PLAN_CATALOG.pro };
  }

  function buildClient(
    overrides: {
      fetch?: typeof fetch;
      breaker?: CircuitBreaker;
      reportCache?: MemoryFallbackCache<Report>;
    } = {},
  ): GydeApiClient {
    return new GydeApiClient({
      apiUrl: API_URL,
      apiKey: API_KEY,
      fetch: overrides.fetch,
      breaker: overrides.breaker ?? new CircuitBreaker(createBreakerFromEnv('test->gateway')),
      reportCache: overrides.reportCache,
    });
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the API key as a Bearer token and never logs it', async () => {
    const seen: { url: string; headers: Record<string, string>; body?: string }[] = [];
    const fetchFake: typeof fetch = async (input, init) => {
      seen.push({
        url: String(input),
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: init?.body === undefined ? undefined : String(init.body),
      });
      if (String(input).endsWith('/v1/auth/verify')) return jsonResponse(authVerifyResponse());
      return jsonResponse({ analysisId: 'analysis-0001', status: 'retrieving' }, 202);
    };

    const logged: unknown[][] = [];
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args);
      });
    }

    const client = buildClient({ fetch: fetchFake });
    await client.verifyKey();
    const accepted = await client.submitAnalysis(sampleAnalysisRequest);

    expect(accepted.analysisId).toBe('analysis-0001');
    expect(seen).toHaveLength(2);
    const [verifyCall, submitCall] = seen;
    expect(verifyCall?.url).toBe(`${API_URL}/v1/auth/verify`);
    expect(verifyCall?.headers['authorization']).toBe(`Bearer ${API_KEY}`);
    expect(submitCall?.headers['authorization']).toBe(`Bearer ${API_KEY}`);
    expect(JSON.parse(submitCall?.body ?? '{}')).toEqual(sampleAnalysisRequest);
    expect(JSON.stringify(logged)).not.toContain(API_KEY);
  });

  it('getMarkdown asks for text/markdown and never leaks the API key in its errors', async () => {
    const seen: { url: string; accept?: string }[] = [];
    const ok = buildClient({
      fetch: async (input, init) => {
        seen.push({
          url: String(input),
          accept: (init?.headers as Record<string, string>)['accept'],
        });
        return new Response('# Report\n', {
          status: 200,
          headers: { 'content-type': 'text/markdown' },
        });
      },
    });
    await expect(ok.getMarkdown('analysis-0001')).resolves.toBe('# Report\n');
    expect(seen[0]).toEqual({
      url: `${API_URL}/v1/analyses/analysis-0001/markdown`,
      accept: 'text/markdown',
    });

    const denied = buildClient({
      fetch: async () => jsonResponse({ error: { code: 'unauthorized', message: 'bad key' } }, 401),
    });
    const error = (await denied
      .getMarkdown('analysis-0001')
      .catch((e: unknown) => e)) as GydeApiError;
    expect(error).toBeInstanceOf(GydeApiError);
    expect(error.hint).toContain('GYDE_API_KEY');
    expect(`${error.message} ${error.hint}`).not.toContain(API_KEY);
  });

  it('validates every response with the @gyde/contracts schemas', async () => {
    const valid = buildClient({
      fetch: async () => jsonResponse(sampleReportReady),
    });
    const report = await valid.getReport('analysis-0001');
    expect(report).toEqual(sampleReportReady);

    const invalidVerify = buildClient({
      fetch: async () => jsonResponse({ plan: 'platinum', entitlements: {} }),
    });
    await expect(invalidVerify.verifyKey()).rejects.toThrow(/does not match the contract/);

    const invalidReport = buildClient({
      fetch: async () => jsonResponse({ id: 'analysis-0001', status: 'bogus' }),
    });
    await expect(invalidReport.getReport('analysis-0001')).rejects.toThrow(
      /does not match the contract/,
    );
  });

  it('goes through the Circuit Breaker and serves the cached report as degraded when open', async () => {
    let gatewayUp = true;
    let fetchCalls = 0;
    const fetchFake: typeof fetch = async () => {
      fetchCalls++;
      if (!gatewayUp) throw new TypeError('fetch failed');
      return jsonResponse(sampleReportReady);
    };

    const breaker = new CircuitBreaker({
      ...createBreakerFromEnv('test->gateway'),
      failureThreshold: 1,
      openTimeoutMs: 60_000,
    });
    const reportCache = new MemoryFallbackCache<Report>({ maxEntries: 10 });
    const client = buildClient({ fetch: fetchFake, breaker, reportCache });

    // First call: gateway answers, the report is cached.
    const fresh = await client.getReport('analysis-0001');
    expect(fresh.degraded).toBe(false);
    expect(fetchCalls).toBe(1);

    // Gateway dies: the call fails, the breaker opens and the cached report is served degraded.
    gatewayUp = false;
    const stale = await client.getReport('analysis-0001');
    expect(stale.degraded).toBe(true);
    expect(stale.findings).toEqual(sampleReportReady.findings);
    expect(breaker.state).toBe('open');

    // Circuit open: the fallback answers again without another fetch attempt.
    const offline = await client.getReport('analysis-0001');
    expect(offline.degraded).toBe(true);
    expect(fetchCalls).toBe(2);
  });

  it('maps 401/402/429 to errors the user can act on', async () => {
    const breaker = new CircuitBreaker({
      ...createBreakerFromEnv('test->gateway'),
      failureThreshold: 1,
    });

    async function failWith(status: number, code: string): Promise<GydeApiError> {
      const client = buildClient({
        breaker,
        fetch: async () =>
          jsonResponse({ error: { code, message: `${code} from the gateway` } }, status),
      });
      const err = await client.verifyKey().then(
        () => {
          throw new Error(`verifyKey should have rejected with HTTP ${status}`);
        },
        (e: unknown) => e,
      );
      return err as GydeApiError;
    }

    const unauthorized = await failWith(HTTP_STATUS_BY_CODE.unauthorized, 'unauthorized');
    expect(unauthorized).toBeInstanceOf(GydeApiError);
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.code).toBe('unauthorized');
    expect(unauthorized.hint).toContain('GYDE_API_KEY');

    const planLimit = await failWith(
      HTTP_STATUS_BY_CODE.plan_limit_exceeded,
      'plan_limit_exceeded',
    );
    expect(planLimit).toBeInstanceOf(GydeApiError);
    expect(planLimit.status).toBe(402);
    expect(planLimit.code).toBe('plan_limit_exceeded');
    expect(planLimit.hint).toContain('plan');

    const rateLimited = await failWith(HTTP_STATUS_BY_CODE.rate_limited, 'rate_limited');
    expect(rateLimited).toBeInstanceOf(GydeApiError);
    expect(rateLimited.status).toBe(429);
    expect(rateLimited.code).toBe('rate_limited');
    expect(rateLimited.hint).toContain('espera');

    // 4xx means the gateway is alive and the key/plan is the problem: the breaker stays closed.
    expect(breaker.state).toBe('closed');
  });
});
