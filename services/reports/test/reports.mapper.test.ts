import { describe, expect, it } from 'vitest';

import type { ReportDto } from '../src/application/dto/analysis.dto';
import {
  toAcceptedContract,
  toAnalysisFailureDto,
  toDeterministicResultDto,
  toReportContract,
} from '../src/http/mappers/reports.mapper';

const base: ReportDto = {
  id: 'a-1',
  status: 'ready',
  createdAt: '2026-10-18T12:00:00.000Z',
  degraded: false,
  appliedLayers: ['basic'],
  summary: { counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 } },
  findings: [],
};

describe('reports mapper', () => {
  it('leaves out every optional key of the report that has no value', () => {
    expect(Object.keys(toReportContract(base))).toEqual([
      'id',
      'status',
      'createdAt',
      'degraded',
      'appliedLayers',
      'summary',
      'findings',
    ]);
  });

  it('keeps the optional keys in the historical order when they have a value', () => {
    const report = toReportContract({
      ...base,
      completedAt: '2026-10-18T12:00:05.000Z',
      degraded: true,
      degradedReason: 'llm-error',
      summary: { counts: base.summary.counts, riskScore: 40 },
      error: { code: 'internal', message: 'boom' },
    });
    expect(Object.keys(report)).toEqual([
      'id',
      'status',
      'createdAt',
      'completedAt',
      'degraded',
      'degradedReason',
      'appliedLayers',
      'summary',
      'findings',
      'error',
    ]);
    expect(Object.keys(report.summary)).toEqual(['counts', 'riskScore']);
  });

  it('builds the accepted answer with exactly its two keys', () => {
    expect(Object.keys(toAcceptedContract({ analysisId: 'a-1', status: 'retrieving' }))).toEqual([
      'analysisId',
      'status',
    ]);
  });

  it('lets the id of the path win over the id of the body', () => {
    const failure = {
      analysisId: 'body',
      stage: 'llm',
      reason: 'llm-error',
      message: 'm',
    } as const;
    expect(toAnalysisFailureDto('path', failure).analysisId).toBe('path');
    const result = {
      analysisId: 'body',
      findings: [],
      evidence: [],
      coverage: { vulnerabilities: true, compatibility: true, licenses: true },
      partialSources: false,
    };
    expect(toDeterministicResultDto('path', result).analysisId).toBe('path');
  });
});
