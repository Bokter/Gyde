import { describe, expect, it } from 'vitest';

import {
  AnalysisRequest,
  ApiError,
  Entitlements,
  ErrorCode,
  Finding,
  HTTP_STATUS_BY_CODE,
  KnowledgeObject,
  PLAN_CATALOG,
  ROUTES,
  Report,
  buildPath,
} from '../src';
import {
  sampleAnalysisRequest,
  sampleKnowledgeObject,
  sampleLicenseFinding,
  sampleReportDegraded,
  sampleReportReady,
  sampleVulnerabilityFinding,
} from '../src/samples';

describe('samples stay valid against their schemas', () => {
  it('validates every sample', () => {
    expect(AnalysisRequest.parse(sampleAnalysisRequest)).toEqual(sampleAnalysisRequest);
    expect(KnowledgeObject.parse(sampleKnowledgeObject)).toEqual(sampleKnowledgeObject);
    expect(Finding.parse(sampleVulnerabilityFinding)).toEqual(sampleVulnerabilityFinding);
    expect(Finding.parse(sampleLicenseFinding)).toEqual(sampleLicenseFinding);
    expect(Report.parse(sampleReportReady)).toEqual(sampleReportReady);
    expect(Report.parse(sampleReportDegraded)).toEqual(sampleReportDegraded);
  });
});

describe('plans', () => {
  it('keeps every plan of the catalog valid', () => {
    for (const entitlements of Object.values(PLAN_CATALOG)) {
      expect(Entitlements.safeParse(entitlements).success).toBe(true);
    }
  });

  it('never gives a lower plan more than a higher one', () => {
    const { free, pro, studio } = PLAN_CATALOG;
    const rank = (e: Entitlements) => Object.values(e.features).filter(Boolean).length;
    expect(rank(free)).toBeLessThanOrEqual(rank(pro));
    expect(rank(pro)).toBeLessThanOrEqual(rank(studio));
  });
});

describe('routes', () => {
  it('exposes only /v1 paths on the public gateway', () => {
    for (const path of Object.values(ROUTES.gateway)) {
      expect(path.startsWith('/v1/')).toBe(true);
    }
  });

  it('keeps every other service-to-service route under /internal (registry aside)', () => {
    const { gateway: _gateway, registry: _registry, ...internal } = ROUTES;
    for (const group of Object.values(internal)) {
      for (const path of Object.values(group)) {
        expect(path.startsWith('/internal/')).toBe(true);
      }
    }
  });

  it('builds paths and refuses missing parameters', () => {
    expect(buildPath(ROUTES.gateway.analysis, { analysisId: 'a 1' })).toBe('/v1/analyses/a%201');
    expect(() => buildPath(ROUTES.gateway.analysis)).toThrow(/analysisId/);
  });
});

describe('errors', () => {
  it('maps every error code to an HTTP status', () => {
    for (const code of ErrorCode.options) {
      expect(HTTP_STATUS_BY_CODE[code]).toBeGreaterThanOrEqual(400);
    }
  });

  it('accepts the standard envelope and rejects extra keys', () => {
    const ok = { error: { code: 'not_found', message: 'No such analysis' } };
    expect(ApiError.safeParse(ok).success).toBe(true);
    expect(ApiError.safeParse({ ...ok, stack: 'at foo' }).success).toBe(false);
  });
});
