/**
 * Synthetic payloads for mocks, fixtures and tests (import from "@gyde/contracts/samples").
 * Nothing here describes a real advisory, package or customer: package names are fictional.
 * `test/contracts.test.ts` validates every sample against its schema, so they cannot drift.
 */
import type { AnalysisRequest } from './analysis';
import { PLAN_CATALOG } from './auth';
import type { Finding } from './findings';
import type { KnowledgeObject } from './knowledge';
import type { Report } from './report';

export const sampleAnalysisRequest: AnalysisRequest = {
  client: { kind: 'cli', version: '0.1.0' },
  project: {
    gameEngine: 'unity',
    gameEngineVersion: '2022.3.20f1',
    sdks: [{ name: 'android-sdk', version: '34' }],
    platforms: ['windows', 'android'],
  },
  dependencies: [
    {
      ecosystem: 'nuget',
      name: 'Acme.Serialization',
      version: '1.4.0',
      declaredLicense: 'MIT',
      direct: true,
    },
    {
      ecosystem: 'nuget',
      name: 'Acme.GplToolkit',
      version: '2.1.0',
      declaredLicense: 'GPL-3.0-only',
      direct: true,
    },
    {
      ecosystem: 'upm',
      name: 'com.unity.render-pipelines.universal',
      version: '14.0.9',
      direct: true,
    },
  ],
  options: { includeAi: true },
};

export const sampleKnowledgeObject: KnowledgeObject = {
  id: 'sample:vuln-0001',
  kind: 'vulnerability',
  source: 'sample',
  sourceKind: 'structured',
  trust: 'high',
  title: 'Sample advisory: unsafe deserialization in Acme.Serialization',
  summary:
    'Synthetic advisory used for tests and mocks. It does not describe a real vulnerability.',
  aliases: ['SAMPLE-0001'],
  severity: 'high',
  cvss: 7.5,
  affected: [{ ecosystem: 'nuget', name: 'Acme.Serialization', introduced: '0', fixed: '1.5.0' }],
  gameEngines: [],
  url: 'https://example.com/advisories/sample-0001',
  publishedAt: '2026-01-15T00:00:00Z',
  modifiedAt: '2026-02-01T00:00:00Z',
  ingestedAt: '2026-10-01T12:00:00Z',
};

export const sampleVulnerabilityFinding: Finding = {
  id: 'finding-vuln-0001',
  kind: 'vulnerability',
  severity: 'high',
  title: 'Acme.Serialization 1.4.0 is affected by SAMPLE-0001',
  dependency: { ecosystem: 'nuget', name: 'Acme.Serialization', version: '1.4.0' },
  evidence: [
    {
      source: 'sample',
      trust: 'high',
      summary: 'Versions below 1.5.0 deserialize untrusted data unsafely.',
      url: 'https://example.com/advisories/sample-0001',
      knowledgeId: 'sample:vuln-0001',
    },
  ],
  impact: 'A crafted payload can crash the process that deserializes it.',
  recommendation: 'Upgrade Acme.Serialization to 1.5.0 or later.',
  cvss: 7.5,
  references: ['https://example.com/advisories/sample-0001'],
  deterministic: true,
};

export const sampleLicenseFinding: Finding = {
  id: 'finding-license-0001',
  kind: 'license',
  severity: 'medium',
  title: 'Acme.GplToolkit is GPL-3.0-only: review compatibility with proprietary distribution',
  dependency: { ecosystem: 'nuget', name: 'Acme.GplToolkit', version: '2.1.0' },
  evidence: [
    {
      source: 'spdx',
      trust: 'high',
      summary: 'GPL-3.0-only is a strong copyleft license.',
    },
  ],
  recommendation:
    'Replace the dependency or confirm with legal that your distribution model allows it.',
  references: [],
  deterministic: true,
};

/** A finished report with every layer applied, including the AI explanation. */
export const sampleReportReady: Report = {
  id: 'analysis-0001',
  status: 'ready',
  createdAt: '2026-10-01T12:00:00Z',
  completedAt: '2026-10-01T12:00:09Z',
  degraded: false,
  appliedLayers: ['basic', 'severity-score', 'license-compliance', 'ai-enrichment'],
  summary: {
    counts: { critical: 0, high: 1, medium: 1, low: 0, info: 0 },
    riskScore: 58,
  },
  findings: [
    {
      ...sampleVulnerabilityFinding,
      aiExplanation:
        'Your project uses a library version that can be crashed with malicious input. Updating is a one-line change.',
    },
    sampleLicenseFinding,
  ],
};

/** The same analysis when the AI layer could not run: deterministic findings only. */
export const sampleReportDegraded: Report = {
  ...sampleReportReady,
  id: 'analysis-0002',
  degraded: true,
  degradedReason: 'llm-not-configured',
  appliedLayers: ['basic', 'severity-score', 'license-compliance'],
  findings: [sampleVulnerabilityFinding, sampleLicenseFinding],
};

export const sampleEntitlementsPro = PLAN_CATALOG.pro;
