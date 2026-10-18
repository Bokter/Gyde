import { createHash } from 'node:crypto';

import { HEADERS, type Finding, type KnowledgeObject, PLAN_CATALOG } from '@gyde/contracts';
import { sampleAnalysisRequest } from '@gyde/contracts/samples';
import { createLogger } from '@gyde/service-kit';
import { afterEach, describe, expect, it } from 'vitest';

import { BackgroundJobs } from '../src/application/background-jobs';
import { configSchema } from '../src/config';
import { compareFindings } from '../src/domain/analyzers/base-analyzer';
import { LicenseAnalyzer } from '../src/domain/analyzers/licenses/license-analyzer';
import { VulnerabilityAnalyzer } from '../src/domain/analyzers/vulnerabilities/vulnerability-analyzer';
import { createApp } from '../src/http/app';
import { sha256Hex } from '../src/infrastructure/sha256-hex';
import { SpdxLicenseExpressionParser } from '../src/infrastructure/spdx-license-expression-parser';
import { FakeServices, HOSTS } from './support/fake-services';

/**
 * Characterization of the external behavior of Retrieval, written BEFORE the clean architecture
 * refactor and kept unchanged by it: exact finding ids (including the hashed form), exact bodies
 * sent to Reports / llm-analysis / normalization, and the failure messages.
 */

const sha40 = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 40);
const longName = 'Acme.' + 'Long'.repeat(40);

const licenseAnalyzer = new LicenseAnalyzer(new SpdxLicenseExpressionParser(), sha256Hex);
const vulnerabilityAnalyzer = new VulnerabilityAnalyzer(sha256Hex);

type Dep = (typeof sampleAnalysisRequest)['dependencies'][number];
const dep = (overrides: Partial<Dep>): Dep => ({
  ecosystem: 'nuget',
  name: 'Acme.Lib',
  version: '1.0.0',
  direct: true,
  ...overrides,
});
const requestWith = (...dependencies: Dep[]) => ({ ...sampleAnalysisRequest, dependencies });

const advisoryFor = (name: string, version = '2.0.0'): KnowledgeObject => ({
  id: 'osv:LONG-1',
  kind: 'vulnerability',
  source: 'osv',
  sourceKind: 'structured',
  trust: 'high',
  title: 'Long',
  summary: 'Long advisory',
  aliases: ['LONG-1'],
  severity: 'high',
  affected: [{ ecosystem: 'nuget', name, fixed: version }],
  gameEngines: [],
  ingestedAt: '2026-10-01T12:00:00Z',
});

const licenseId = (name: string, license = 'GPL-3.0-only') =>
  licenseAnalyzer.analyze({
    request: requestWith(dep({ name, declaredLicense: license })),
    knowledge: [],
  }).findings[0]?.id;

const vulnerabilityId = (name: string) =>
  vulnerabilityAnalyzer.analyze({
    request: requestWith(dep({ name })),
    knowledge: [advisoryFor(name)],
  }).findings[0]?.id;

describe('finding ids', () => {
  it('hashes a long license id: license:<sha256 hex, first 40>', () => {
    const id = licenseId(longName);
    // Literal computed once from the readable form `license:nuget:<name>@1.0.0`.
    expect(id).toBe('license:c8db9d6ffd4312bb4fb6ec4a47dfd63efa2c6404');
    expect(id).toBe(`license:${sha40(`license:nuget:${longName}@1.0.0`)}`);
  });

  it('hashes a long vulnerability id: vuln:<sha256 hex, first 40>', () => {
    const id = vulnerabilityId(longName);
    // Literal computed once from the readable form `vuln:LONG-1:nuget:<name>@1.0.0`.
    expect(id).toBe('vuln:3bc8cacf5b5cba8e4c0058071b2dcee2b4fc9004');
    expect(id).toBe(`vuln:${sha40(`vuln:LONG-1:nuget:${longName}@1.0.0`)}`);
  });

  it('keeps the readable license id at exactly 100 characters and hashes at 101', () => {
    const at100 = 'L'.repeat(80);
    const at101 = 'L'.repeat(81);
    expect(licenseId(at100)).toBe(`license:nuget:${at100}@1.0.0`);
    expect(licenseId(at100)?.length).toBe(100);
    expect(licenseId(at101)).toBe(`license:${sha40(`license:nuget:${at101}@1.0.0`)}`);
  });

  it('keeps the readable vulnerability id at exactly 100 characters and hashes at 101', () => {
    const at100 = 'V'.repeat(76);
    const at101 = 'V'.repeat(77);
    expect(vulnerabilityId(at100)).toBe(`vuln:LONG-1:nuget:${at100}@1.0.0`);
    expect(vulnerabilityId(at100)?.length).toBe(100);
    expect(vulnerabilityId(at101)).toBe(`vuln:${sha40(`vuln:LONG-1:nuget:${at101}@1.0.0`)}`);
  });
});

describe('compareFindings', () => {
  const finding = (overrides: Partial<Finding>): Finding => ({
    id: 'x',
    kind: 'license',
    severity: 'medium',
    title: 'same',
    evidence: [],
    references: [],
    deterministic: true,
    ...overrides,
  });

  it('breaks a full tie by id', () => {
    const sorted = [finding({ id: 'b' }), finding({ id: 'a' }), finding({ id: 'c' })].sort(
      compareFindings,
    );
    expect(sorted.map((f) => f.id)).toEqual(['a', 'b', 'c']);
  });

  it('treats a missing cvss as 0', () => {
    const sorted = [finding({ id: 'a' }), finding({ id: 'b', cvss: 0.1 })].sort(compareFindings);
    expect(sorted.map((f) => f.id)).toEqual(['b', 'a']);
  });
});

describe('every kind of license finding, exactly', () => {
  const only = (declaredLicense: string | undefined, ecosystem: Dep['ecosystem'] = 'nuget') =>
    licenseAnalyzer.analyze({
      request: requestWith(
        dep({ ecosystem, ...(declaredLicense !== undefined && { declaredLicense }) }),
      ),
      knowledge: [],
    }).findings;
  const base = {
    id: 'license:nuget:Acme.Lib@1.0.0',
    kind: 'license',
    dependency: { ecosystem: 'nuget', name: 'Acme.Lib', version: '1.0.0' },
    references: [],
    deterministic: true,
  };

  it('incompatible', () => {
    expect(only('GPL-2.0-only AND Apache-2.0')).toEqual([
      {
        ...base,
        severity: 'high',
        title:
          'Acme.Lib requires licenses that cannot be satisfied together: gpl-2.0-only and apache-2.0',
        evidence: [
          {
            source: 'spdx',
            trust: 'high',
            summary:
              'GPL-2.0-only AND Apache-2.0: gpl-2.0-only and apache-2.0 cannot both be complied with at once.',
          },
        ],
        impact: 'No distribution of the package can satisfy both licenses.',
        recommendation:
          'Ask the author which license applies, or replace the dependency. Confirm with legal.',
      },
    ]);
  });

  it('unknown but valid SPDX', () => {
    expect(only('Artistic-2.0')).toEqual([
      {
        ...base,
        severity: 'info',
        title: 'Acme.Lib declares a license Gyde cannot classify: Artistic-2.0',
        evidence: [
          {
            source: 'spdx',
            trust: 'high',
            summary: '"Artistic-2.0" is a valid SPDX expression, but Gyde has no policy for it.',
          },
        ],
        recommendation:
          'Check the license of the package by hand and, if you rely on it, ask the author for an SPDX identifier.',
      },
    ]);
  });

  it('not an SPDX expression', () => {
    const [finding] = only('not a license!!');
    expect(finding?.evidence[0]?.summary).toBe(
      '"not a license!!" is not a valid SPDX license expression.',
    );
    expect(finding?.severity).toBe('info');
  });

  it('missing license: only NuGet', () => {
    expect(only(undefined)).toEqual([
      {
        ...base,
        severity: 'info',
        title: 'Acme.Lib does not declare a license',
        evidence: [
          {
            source: 'spdx',
            trust: 'high',
            summary:
              'The package metadata has no license; without one, no right to use it is granted.',
          },
        ],
        recommendation: 'Find out the license of the package before shipping it.',
      },
    ]);
    expect(only(undefined, 'upm')).toEqual([]);
  });

  it('weak, strong and network copyleft keep their severities and texts', () => {
    expect(only('LGPL-3.0-only')[0]).toMatchObject({
      severity: 'low',
      title: 'Acme.Lib is LGPL-3.0-only: check how it is linked and shipped',
    });
    expect(only('AGPL-3.0-only')[0]).toMatchObject({
      severity: 'high',
      title:
        'Acme.Lib is AGPL-3.0-only: review compatibility with proprietary distribution and online services',
    });
  });
});

// ---------------------------------------------------------------------------------------------
// The whole pipeline over fake downstream services.
// ---------------------------------------------------------------------------------------------

const token = 'test-internal-token-123456';
const auth = { [HEADERS.internalToken]: token };
const config = configSchema.parse({
  INTERNAL_SERVICE_TOKEN: token,
  NORMALIZATION_URL: HOSTS.normalization,
  REPORTS_URL: HOSTS.reports,
  LLM_ANALYSIS_URL: HOSTS.llm,
});
const pro = PLAN_CATALOG.pro;

const open: Awaited<ReturnType<typeof createApp>>[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((app) => app.close()));
});

async function run(
  services: FakeServices,
  request: typeof sampleAnalysisRequest = sampleAnalysisRequest,
) {
  const app = await createApp({
    config,
    logger: createLogger({ name: 'retrieval-test', level: 'silent' }),
    module: { fetch: services.fetch, sleep: async () => undefined },
  });
  open.push(app);
  await app.inject({
    method: 'POST',
    url: '/internal/retrieve',
    headers: auth,
    payload: { analysisId: 'analysis-1', tenantId: 'tenant-1', entitlements: pro, request },
  });
  await app.get(BackgroundJobs).idle();
}

const shared = {
  vulnerability: {
    id: 'vuln:SAMPLE-0001:nuget:Acme.Serialization@1.4.0',
    kind: 'vulnerability',
    severity: 'high',
    title: 'Acme.Serialization 1.4.0 is affected by SAMPLE-0001',
    dependency: { ecosystem: 'nuget', name: 'Acme.Serialization', version: '1.4.0' },
    evidence: [
      {
        source: 'ghsa',
        trust: 'high',
        summary:
          'Synthetic advisory used for tests and mocks. It does not describe a real vulnerability.',
        url: 'https://github.com/advisories/GHSA-0000-0000-0001',
        knowledgeId: 'ghsa:GHSA-0000-0000-0001',
      },
      {
        source: 'osv',
        trust: 'high',
        summary:
          'Synthetic advisory used for tests and mocks. It does not describe a real vulnerability.',
        url: 'https://example.com/advisories/sample-0001',
        knowledgeId: 'osv:SAMPLE-0001',
      },
    ],
    impact:
      'Acme.Serialization 1.4.0 is inside the affected range (fixed 1.5.0; introduced 0, fixed 1.5.0) of SAMPLE-0001.',
    recommendation: 'Upgrade Acme.Serialization to 1.5.0 or later.',
    cvss: 7.5,
    references: [
      'https://github.com/advisories/GHSA-0000-0000-0001',
      'https://example.com/advisories/sample-0001',
    ],
    deterministic: true,
  },
  license: {
    id: 'license:nuget:Acme.GplToolkit@2.1.0',
    kind: 'license',
    dependency: { ecosystem: 'nuget', name: 'Acme.GplToolkit', version: '2.1.0' },
    references: [],
    deterministic: true,
    severity: 'medium',
    title: 'Acme.GplToolkit is GPL-3.0-only: review compatibility with proprietary distribution',
    evidence: [
      { source: 'spdx', trust: 'high', summary: 'GPL-3.0-only is a strong copyleft license.' },
    ],
    impact:
      'Distributing a game that includes it can require offering the source of the whole combined work under the same license.',
    recommendation:
      'Replace the dependency or confirm with legal that your distribution model allows it.',
  },
};
const findings = [shared.vulnerability, shared.license];
const evidence = findings.flatMap((f) => f.evidence);

describe('exact bodies sent downstream', () => {
  it('sends the deterministic result to Reports exactly (and with this key order)', async () => {
    const services = new FakeServices(token);
    await run(services, { ...sampleAnalysisRequest, options: { includeAi: false } });

    const [call] = services.callsTo('reports');
    expect(call?.path).toBe('/internal/analyses/analysis-1/deterministic');
    expect(call?.body).toEqual({
      analysisId: 'analysis-1',
      findings,
      evidence,
      coverage: { vulnerabilities: true, compatibility: false, licenses: true },
      partialSources: false,
    });
    const body = call?.body as { findings: object[] } & Record<string, unknown>;
    expect(Object.keys(body)).toEqual([
      'analysisId',
      'findings',
      'evidence',
      'coverage',
      'partialSources',
    ]);
    expect(Object.keys(body.findings[0]!)).toEqual(Object.keys(shared.vulnerability));
    expect(Object.keys(body.findings[1]!)).toEqual(Object.keys(shared.license));
  });

  it('sends llm-analysis exactly the project, the findings and the evidence', async () => {
    const services = new FakeServices(token);
    await run(services);

    const [call] = services.callsTo('llm');
    expect(call?.path).toBe('/internal/analyze');
    expect(call?.body).toEqual({
      analysisId: 'analysis-1',
      tenantId: 'tenant-1',
      project: {
        gameEngine: 'unity',
        gameEngineVersion: '2022.3.20f1',
        sdks: [{ name: 'android-sdk', version: '34' }],
        platforms: ['windows', 'android'],
      },
      findings,
      evidence,
    });
    expect(Object.keys(call?.body as object)).toEqual([
      'analysisId',
      'tenantId',
      'project',
      'findings',
      'evidence',
    ]);
    expect(services.callsTo('llm')).toHaveLength(1);
  });

  it('asks normalization once, exactly: packages (deduplicated, in order), engine, limit', async () => {
    const services = new FakeServices(token);
    const duplicated = requestWith(
      ...sampleAnalysisRequest.dependencies,
      dep({ name: 'Acme.Serialization', version: '1.4.0' }),
    );
    await run(services, { ...duplicated, options: { includeAi: false } });

    const [call] = services.callsTo('normalization');
    expect(services.callsTo('normalization')).toHaveLength(1);
    expect(call?.path).toBe('/internal/knowledge/query');
    expect(call?.body).toEqual({
      packages: [
        { ecosystem: 'nuget', name: 'Acme.Serialization', version: '1.4.0' },
        { ecosystem: 'nuget', name: 'Acme.GplToolkit', version: '2.1.0' },
        { ecosystem: 'upm', name: 'com.unity.render-pipelines.universal', version: '14.0.9' },
      ],
      gameEngine: 'unity',
      limit: 5000,
    });
    // The key order is part of the cache key of the fallback cache.
    expect(Object.keys(call?.body as object)).toEqual(['packages', 'gameEngine', 'limit']);
  });

  it('does not call normalization when there are no dependencies', async () => {
    const services = new FakeServices(token);
    await run(services, { ...requestWith(), options: { includeAi: false } });

    expect(services.callsTo('normalization')).toEqual([]);
    expect(services.deterministicResults[0]).toMatchObject({
      findings: [],
      evidence: [],
      partialSources: false,
    });
  });
});

describe('exact failure messages', () => {
  it('retrieval-error when the analysis fails', async () => {
    const services = new FakeServices(token);
    services.behavior.normalization = 'reject400';
    await run(services, { ...sampleAnalysisRequest, options: { includeAi: false } });

    expect(services.failures).toEqual([
      {
        analysisId: 'analysis-1',
        stage: 'retrieval',
        reason: 'retrieval-error',
        message: 'Retrieval could not complete the deterministic analysis.',
      },
    ]);
  });

  it('retrieval-error when Reports refuses the deterministic result', async () => {
    const services = new FakeServices(token);
    const inner = services.fetch;
    Object.defineProperty(services, 'fetch', {
      value: (async (input, init) =>
        String(input).endsWith('/deterministic')
          ? new Response('{}', { status: 400 })
          : inner(input, init)) satisfies typeof fetch,
    });
    await run(services, { ...sampleAnalysisRequest, options: { includeAi: false } });

    expect(services.deterministicResults).toEqual([]);
    expect(services.failures).toEqual([
      {
        analysisId: 'analysis-1',
        stage: 'retrieval',
        reason: 'retrieval-error',
        message: 'The deterministic result could not be delivered to Reports.',
      },
    ]);
  });

  it('llm-unavailable and llm-error, with their fixed messages', async () => {
    const down = new FakeServices(token);
    down.behavior.llm = 'down';
    await run(down);
    expect(down.failures).toEqual([
      {
        analysisId: 'analysis-1',
        stage: 'llm',
        reason: 'llm-unavailable',
        message: 'llm-analysis could not be reached; the report stays deterministic.',
      },
    ]);

    const refused = new FakeServices(token);
    refused.behavior.llm = 'reject400';
    await run(refused);
    expect(refused.failures).toEqual([
      {
        analysisId: 'analysis-1',
        stage: 'llm',
        reason: 'llm-error',
        message: 'llm-analysis rejected the request; the report stays deterministic.',
      },
    ]);
  });

  it('paths of the failure notice', async () => {
    const services = new FakeServices(token);
    services.behavior.llm = 'down';
    await run(services);
    const paths = services.callsTo('reports').map((c) => c.path);
    expect(paths).toEqual([
      '/internal/analyses/analysis-1/deterministic',
      '/internal/analyses/analysis-1/failure',
    ]);
  });
});
