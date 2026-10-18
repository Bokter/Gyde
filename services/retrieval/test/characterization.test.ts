import { createHash } from 'node:crypto';

import { PLAN_CATALOG } from '@gyde/contracts';
import { sampleAnalysisRequest } from '@gyde/contracts/samples';
import { createLogger } from '@gyde/service-kit';
import { afterEach, describe, expect, it } from 'vitest';

import { BackgroundJobs } from '../src/application/background-jobs';
import { configSchema } from '../src/config';
import { LicenseAnalyzer } from '../src/domain/analyzers/licenses/license-analyzer';
import { VulnerabilityAnalyzer } from '../src/domain/analyzers/vulnerabilities/vulnerability-analyzer';
import { createApp } from '../src/http/app';
import { FakeServices, HOSTS } from './support/fake-services';

/**
 * Pins what leaves the service and how finding ids are built, so the clean architecture refactor
 * can move code without changing a single byte on the wire.
 */
const token = 'test-internal-token-123456';
const config = configSchema.parse({
  INTERNAL_SERVICE_TOKEN: token,
  NORMALIZATION_URL: HOSTS.normalization,
  REPORTS_URL: HOSTS.reports,
  LLM_ANALYSIS_URL: HOSTS.llm,
});

const open: Awaited<ReturnType<typeof createApp>>[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((app) => app.close()));
});

const sha = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 40);

describe('finding ids', () => {
  const longName = 'Acme.' + 'Long'.repeat(40);

  it('hashes a license id that would exceed 100 characters: sha256 of the readable id, 40 hex', () => {
    const [finding] = new LicenseAnalyzer().analyze({
      request: {
        ...sampleAnalysisRequest,
        dependencies: [
          {
            ecosystem: 'nuget',
            name: longName,
            version: '1.0.0',
            declaredLicense: 'GPL-3.0-only',
            direct: true,
          },
        ],
      },
      knowledge: [],
    }).findings;
    expect(finding?.id).toBe(`license:${sha(`license:nuget:${longName}@1.0.0`)}`);
  });

  it('hashes a vulnerability id that would exceed 100 characters, keeping the prefix', () => {
    const [finding] = new VulnerabilityAnalyzer().analyze({
      request: {
        ...sampleAnalysisRequest,
        dependencies: [{ ecosystem: 'nuget', name: longName, version: '1.0.0', direct: true }],
      },
      knowledge: [
        {
          id: 'osv:LONG-1',
          kind: 'vulnerability',
          source: 'osv',
          sourceKind: 'structured',
          trust: 'high',
          title: 'Long',
          summary: '',
          aliases: ['LONG-1'],
          affected: [{ ecosystem: 'nuget', name: longName, fixed: '2.0.0' }],
          gameEngines: [],
          ingestedAt: '2026-10-01T12:00:00Z',
        },
      ],
    }).findings;
    expect(finding?.id).toBe(`vuln:${sha(`vuln:LONG-1:nuget:${longName}@1.0.0`)}`);
  });

  it('keeps short ids readable', () => {
    const [finding] = new LicenseAnalyzer().analyze({
      request: {
        ...sampleAnalysisRequest,
        dependencies: [
          {
            ecosystem: 'nuget',
            name: 'A.B',
            version: '1.0.0',
            declaredLicense: 'GPL-3.0-only',
            direct: true,
          },
        ],
      },
      knowledge: [],
    }).findings;
    expect(finding?.id).toBe('license:nuget:A.B@1.0.0');
  });
});

describe('what leaves the service', () => {
  it('sends the exact bodies to normalization, reports and llm-analysis', async () => {
    const services = new FakeServices(token);
    const app = await createApp({
      config,
      logger: createLogger({ name: 'retrieval-test', level: 'silent' }),
      module: { fetch: services.fetch, sleep: async () => undefined },
    });
    open.push(app);
    const res = await app.inject({
      method: 'POST',
      url: '/internal/retrieve',
      headers: { 'x-internal-token': token },
      payload: {
        analysisId: 'analysis-1',
        tenantId: 'tenant-1',
        entitlements: PLAN_CATALOG.pro,
        request: sampleAnalysisRequest,
      },
    });
    await app.get(BackgroundJobs).idle();

    expect(res.statusCode).toBe(202);
    expect(services.calls.map((call) => [call.service, call.path, call.body]))
      .toMatchInlineSnapshot(`
      [
        [
          "normalization",
          "/internal/knowledge/query",
          {
            "gameEngine": "unity",
            "limit": 5000,
            "packages": [
              {
                "ecosystem": "nuget",
                "name": "Acme.Serialization",
                "version": "1.4.0",
              },
              {
                "ecosystem": "nuget",
                "name": "Acme.GplToolkit",
                "version": "2.1.0",
              },
              {
                "ecosystem": "upm",
                "name": "com.unity.render-pipelines.universal",
                "version": "14.0.9",
              },
            ],
          },
        ],
        [
          "reports",
          "/internal/analyses/analysis-1/deterministic",
          {
            "analysisId": "analysis-1",
            "coverage": {
              "compatibility": false,
              "licenses": true,
              "vulnerabilities": true,
            },
            "evidence": [
              {
                "knowledgeId": "ghsa:GHSA-0000-0000-0001",
                "source": "ghsa",
                "summary": "Synthetic advisory used for tests and mocks. It does not describe a real vulnerability.",
                "trust": "high",
                "url": "https://github.com/advisories/GHSA-0000-0000-0001",
              },
              {
                "knowledgeId": "osv:SAMPLE-0001",
                "source": "osv",
                "summary": "Synthetic advisory used for tests and mocks. It does not describe a real vulnerability.",
                "trust": "high",
                "url": "https://example.com/advisories/sample-0001",
              },
              {
                "source": "spdx",
                "summary": "GPL-3.0-only is a strong copyleft license.",
                "trust": "high",
              },
            ],
            "findings": [
              {
                "cvss": 7.5,
                "dependency": {
                  "ecosystem": "nuget",
                  "name": "Acme.Serialization",
                  "version": "1.4.0",
                },
                "deterministic": true,
                "evidence": [
                  {
                    "knowledgeId": "ghsa:GHSA-0000-0000-0001",
                    "source": "ghsa",
                    "summary": "Synthetic advisory used for tests and mocks. It does not describe a real vulnerability.",
                    "trust": "high",
                    "url": "https://github.com/advisories/GHSA-0000-0000-0001",
                  },
                  {
                    "knowledgeId": "osv:SAMPLE-0001",
                    "source": "osv",
                    "summary": "Synthetic advisory used for tests and mocks. It does not describe a real vulnerability.",
                    "trust": "high",
                    "url": "https://example.com/advisories/sample-0001",
                  },
                ],
                "id": "vuln:SAMPLE-0001:nuget:Acme.Serialization@1.4.0",
                "impact": "Acme.Serialization 1.4.0 is inside the affected range (fixed 1.5.0; introduced 0, fixed 1.5.0) of SAMPLE-0001.",
                "kind": "vulnerability",
                "recommendation": "Upgrade Acme.Serialization to 1.5.0 or later.",
                "references": [
                  "https://github.com/advisories/GHSA-0000-0000-0001",
                  "https://example.com/advisories/sample-0001",
                ],
                "severity": "high",
                "title": "Acme.Serialization 1.4.0 is affected by SAMPLE-0001",
              },
              {
                "dependency": {
                  "ecosystem": "nuget",
                  "name": "Acme.GplToolkit",
                  "version": "2.1.0",
                },
                "deterministic": true,
                "evidence": [
                  {
                    "source": "spdx",
                    "summary": "GPL-3.0-only is a strong copyleft license.",
                    "trust": "high",
                  },
                ],
                "id": "license:nuget:Acme.GplToolkit@2.1.0",
                "impact": "Distributing a game that includes it can require offering the source of the whole combined work under the same license.",
                "kind": "license",
                "recommendation": "Replace the dependency or confirm with legal that your distribution model allows it.",
                "references": [],
                "severity": "medium",
                "title": "Acme.GplToolkit is GPL-3.0-only: review compatibility with proprietary distribution",
              },
            ],
            "partialSources": false,
          },
        ],
        [
          "llm",
          "/internal/analyze",
          {
            "analysisId": "analysis-1",
            "evidence": [
              {
                "knowledgeId": "ghsa:GHSA-0000-0000-0001",
                "source": "ghsa",
                "summary": "Synthetic advisory used for tests and mocks. It does not describe a real vulnerability.",
                "trust": "high",
                "url": "https://github.com/advisories/GHSA-0000-0000-0001",
              },
              {
                "knowledgeId": "osv:SAMPLE-0001",
                "source": "osv",
                "summary": "Synthetic advisory used for tests and mocks. It does not describe a real vulnerability.",
                "trust": "high",
                "url": "https://example.com/advisories/sample-0001",
              },
              {
                "source": "spdx",
                "summary": "GPL-3.0-only is a strong copyleft license.",
                "trust": "high",
              },
            ],
            "findings": [
              {
                "cvss": 7.5,
                "dependency": {
                  "ecosystem": "nuget",
                  "name": "Acme.Serialization",
                  "version": "1.4.0",
                },
                "deterministic": true,
                "evidence": [
                  {
                    "knowledgeId": "ghsa:GHSA-0000-0000-0001",
                    "source": "ghsa",
                    "summary": "Synthetic advisory used for tests and mocks. It does not describe a real vulnerability.",
                    "trust": "high",
                    "url": "https://github.com/advisories/GHSA-0000-0000-0001",
                  },
                  {
                    "knowledgeId": "osv:SAMPLE-0001",
                    "source": "osv",
                    "summary": "Synthetic advisory used for tests and mocks. It does not describe a real vulnerability.",
                    "trust": "high",
                    "url": "https://example.com/advisories/sample-0001",
                  },
                ],
                "id": "vuln:SAMPLE-0001:nuget:Acme.Serialization@1.4.0",
                "impact": "Acme.Serialization 1.4.0 is inside the affected range (fixed 1.5.0; introduced 0, fixed 1.5.0) of SAMPLE-0001.",
                "kind": "vulnerability",
                "recommendation": "Upgrade Acme.Serialization to 1.5.0 or later.",
                "references": [
                  "https://github.com/advisories/GHSA-0000-0000-0001",
                  "https://example.com/advisories/sample-0001",
                ],
                "severity": "high",
                "title": "Acme.Serialization 1.4.0 is affected by SAMPLE-0001",
              },
              {
                "dependency": {
                  "ecosystem": "nuget",
                  "name": "Acme.GplToolkit",
                  "version": "2.1.0",
                },
                "deterministic": true,
                "evidence": [
                  {
                    "source": "spdx",
                    "summary": "GPL-3.0-only is a strong copyleft license.",
                    "trust": "high",
                  },
                ],
                "id": "license:nuget:Acme.GplToolkit@2.1.0",
                "impact": "Distributing a game that includes it can require offering the source of the whole combined work under the same license.",
                "kind": "license",
                "recommendation": "Replace the dependency or confirm with legal that your distribution model allows it.",
                "references": [],
                "severity": "medium",
                "title": "Acme.GplToolkit is GPL-3.0-only: review compatibility with proprietary distribution",
              },
            ],
            "project": {
              "gameEngine": "unity",
              "gameEngineVersion": "2022.3.20f1",
              "platforms": [
                "windows",
                "android",
              ],
              "sdks": [
                {
                  "name": "android-sdk",
                  "version": "34",
                },
              ],
            },
            "tenantId": "tenant-1",
          },
        ],
      ]
    `);
  });
});
