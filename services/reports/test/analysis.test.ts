import { PLAN_CATALOG } from '@gyde/contracts';
import { sampleLicenseFinding, sampleVulnerabilityFinding } from '@gyde/contracts/samples';
import { describe, expect, it } from 'vitest';

import { Analysis, type NewAnalysis } from '../src/domain/analysis/analysis';
import type {
  AiResult,
  AnalysisFailure,
  DeterministicResult,
} from '../src/domain/analysis/analysis-types';
import { buildReport } from '../src/domain/report/build-report';

const T0 = new Date('2026-10-18T12:00:00.000Z');
const T1 = new Date('2026-10-18T12:05:00.000Z');

function newAnalysis(overrides: Partial<NewAnalysis> = {}): Analysis {
  return Analysis.create(
    {
      id: 'a-1',
      tenantId: 'tenant-1',
      entitlements: PLAN_CATALOG.pro,
      includeAi: true,
      ...overrides,
    },
    T0,
  );
}

const deterministic = (findings = [sampleVulnerabilityFinding]): DeterministicResult => ({
  analysisId: 'a-1',
  findings,
  evidence: [],
  coverage: { vulnerabilities: true, compatibility: true, licenses: true },
  partialSources: false,
});

const ai: AiResult = {
  analysisId: 'a-1',
  findings: [{ ...sampleVulnerabilityFinding, aiExplanation: 'Explained.' }],
};

const failure = (
  stage: AnalysisFailure['stage'],
  reason: AnalysisFailure['reason'],
): AnalysisFailure => ({ analysisId: 'a-1', stage, reason, message: 'boom' });

/** An analysis driven to `analyzing` / `ready` / `failed` through the public transitions. */
function inState(state: 'analyzing' | 'ready' | 'failed'): Analysis {
  const analysis = newAnalysis();
  if (state === 'failed') analysis.recordFailure(failure('retrieval', 'retrieval-error'), T0);
  else analysis.recordDeterministic(deterministic(), T0);
  if (state === 'ready') analysis.recordAi(ai, T0);
  return analysis;
}

describe('Analysis.create', () => {
  it('starts as retrieving, with the creation time and without optional parts', () => {
    expect(newAnalysis().snapshot()).toEqual({
      id: 'a-1',
      tenantId: 'tenant-1',
      entitlements: PLAN_CATALOG.pro,
      aiExpected: true,
      status: 'retrieving',
      createdAt: '2026-10-18T12:00:00.000Z',
    });
  });

  it.each([
    { plan: 'pro', includeAi: true, expected: true },
    { plan: 'pro', includeAi: false, expected: false },
    { plan: 'free', includeAi: true, expected: false },
    { plan: 'studio', includeAi: true, expected: true },
  ] as const)('expects AI = $expected for $plan with includeAi $includeAi', (c) => {
    const analysis = newAnalysis({ entitlements: PLAN_CATALOG[c.plan], includeAi: c.includeAi });
    expect(analysis.snapshot().aiExpected).toBe(c.expected);
  });

  it('never writes the pending status', () => {
    expect(newAnalysis().status).toBe('retrieving');
  });
});

describe('Analysis.rehydrate and snapshot', () => {
  it('round-trips the state and hands out copies', () => {
    const original = inState('ready');
    const copy = Analysis.rehydrate(original.snapshot());
    expect(copy.snapshot()).toEqual(original.snapshot());

    const taken = original.snapshot();
    taken.status = 'failed';
    expect(original.status).toBe('ready');
  });

  it('isOwnedBy only matches the exact tenant (a missing tenant owns nothing)', () => {
    const analysis = newAnalysis();
    expect(analysis.isOwnedBy('tenant-1')).toBe(true);
    expect(analysis.isOwnedBy('tenant-2')).toBe(false);
    expect(analysis.isOwnedBy(undefined)).toBe(false);
  });
});

describe('Analysis.recordDeterministic', () => {
  it('moves to analyzing when AI is expected', () => {
    const analysis = newAnalysis();
    expect(analysis.recordDeterministic(deterministic(), T1)).toBe('analyzing');
    expect(analysis.snapshot()).toMatchObject({
      status: 'analyzing',
      deterministic: deterministic(),
    });
    expect(analysis.snapshot().completedAt).toBeUndefined();
  });

  it('moves straight to ready when AI is not expected', () => {
    const analysis = newAnalysis({ includeAi: false });
    expect(analysis.recordDeterministic(deterministic(), T1)).toBe('ready');
    expect(analysis.snapshot()).toMatchObject({
      status: 'ready',
      completedAt: '2026-10-18T12:05:00.000Z',
    });
  });

  it('completes the job when the AI result arrived first', () => {
    const analysis = newAnalysis();
    analysis.recordAi(ai, T0);
    expect(analysis.recordDeterministic(deterministic(), T1)).toBe('ready');
    expect(analysis.snapshot()).toMatchObject({
      status: 'ready',
      ai,
      completedAt: T1.toISOString(),
    });
  });

  it('keeps an early AI result without using it when AI was not expected', () => {
    const analysis = newAnalysis({ includeAi: false });
    analysis.recordAi(ai, T0);
    expect(analysis.recordDeterministic(deterministic(), T1)).toBe('ready');
    expect(analysis.snapshot().ai).toEqual(ai);
  });

  it.each(['analyzing', 'ready', 'failed'] as const)('ignores a duplicate while %s', (state) => {
    const analysis = inState(state);
    const before = analysis.snapshot();
    expect(analysis.recordDeterministic({ ...deterministic([]), partialSources: true }, T1)).toBe(
      'ignored',
    );
    expect(analysis.snapshot()).toEqual(before);
  });
});

describe('Analysis.recordAi', () => {
  it('analyzing -> ready', () => {
    const analysis = inState('analyzing');
    expect(analysis.recordAi(ai, T1)).toBe(true);
    expect(analysis.snapshot()).toMatchObject({
      status: 'ready',
      ai,
      completedAt: T1.toISOString(),
    });
  });

  it('is kept aside while there is no deterministic result, and a second one replaces it', () => {
    const analysis = newAnalysis();
    expect(analysis.recordAi(ai, T1)).toBe(true);
    expect(analysis.status).toBe('retrieving');
    expect(analysis.snapshot().completedAt).toBeUndefined();

    const second = { ...ai, summary: 'Second.' };
    analysis.recordAi(second, T1);
    expect(analysis.snapshot().ai).toEqual(second);
  });

  it.each(['ready', 'failed'] as const)('is ignored while %s', (state) => {
    const analysis = inState(state);
    const before = analysis.snapshot();
    expect(analysis.recordAi({ ...ai, summary: 'late' }, T1)).toBe(false);
    expect(analysis.snapshot()).toEqual(before);
  });
});

describe('Analysis.recordFailure', () => {
  it('llm failure with AI expected: ready, from retrieving too (no deterministic result needed)', () => {
    const early = newAnalysis();
    expect(early.recordFailure(failure('llm', 'llm-error'), T1)).toBe(true);
    expect(early.snapshot()).toMatchObject({
      status: 'ready',
      completedAt: T1.toISOString(),
      failure: failure('llm', 'llm-error'),
    });
    expect(early.snapshot().deterministic).toBeUndefined();

    const late = inState('analyzing');
    expect(late.recordFailure(failure('llm', 'llm-not-configured'), T1)).toBe(true);
    expect(late.status).toBe('ready');
  });

  it('llm failure is ignored when AI was not expected', () => {
    const analysis = newAnalysis({ includeAi: false });
    const before = analysis.snapshot();
    expect(analysis.recordFailure(failure('llm', 'llm-error'), T1)).toBe(false);
    expect(analysis.snapshot()).toEqual(before);
  });

  it.each(['retrieving', 'analyzing'] as const)('retrieval failure while %s: failed', (from) => {
    const analysis = from === 'retrieving' ? newAnalysis() : inState('analyzing');
    expect(analysis.recordFailure(failure('retrieval', 'retrieval-error'), T1)).toBe(true);
    expect(analysis.snapshot()).toMatchObject({
      status: 'failed',
      completedAt: T1.toISOString(),
      failure: failure('retrieval', 'retrieval-error'),
    });
  });

  it('does not check that the reason fits the stage', () => {
    const analysis = newAnalysis();
    analysis.recordFailure(failure('llm', 'retrieval-error'), T1);
    expect(analysis.snapshot().failure?.reason).toBe('retrieval-error');
  });

  it.each(['ready', 'failed'] as const)('is ignored while %s, whatever the stage', (state) => {
    const analysis = inState(state);
    const before = analysis.snapshot();
    expect(analysis.recordFailure(failure('retrieval', 'retrieval-error'), T1)).toBe(false);
    expect(analysis.recordFailure(failure('llm', 'llm-error'), T1)).toBe(false);
    expect(analysis.snapshot()).toEqual(before);
  });
});

describe('time-outs', () => {
  it('timeOutAi closes an analyzing job as ready + llm-unavailable', () => {
    const analysis = inState('analyzing');
    expect(analysis.timeOutAi(T1, 'timeout')).toBe(true);
    expect(analysis.snapshot()).toMatchObject({
      status: 'ready',
      completedAt: T1.toISOString(),
      failure: {
        analysisId: 'a-1',
        stage: 'llm',
        reason: 'llm-unavailable',
        message: 'AI result did not arrive within the timeout window',
      },
    });
  });

  it('timeOutAi after a restart only changes the message', () => {
    const analysis = inState('analyzing');
    analysis.timeOutAi(T1, 'restart');
    expect(analysis.snapshot().failure?.message).toBe(
      'AI result did not arrive before the service restarted',
    );
  });

  it('timeOutRetrieval closes a retrieving job as failed + retrieval-error', () => {
    const analysis = newAnalysis();
    expect(analysis.timeOutRetrieval(T1, 'timeout')).toBe(true);
    expect(analysis.snapshot()).toMatchObject({
      status: 'failed',
      completedAt: T1.toISOString(),
      failure: {
        analysisId: 'a-1',
        stage: 'retrieval',
        reason: 'retrieval-error',
        message: 'Retrieval did not deliver a result within the timeout window',
      },
    });
  });

  it('timeOutRetrieval after a restart only changes the message', () => {
    const analysis = newAnalysis();
    analysis.timeOutRetrieval(T1, 'restart');
    expect(analysis.snapshot().failure?.message).toBe(
      'Retrieval did not deliver a result before the service restarted',
    );
  });

  it('each watchdog only acts on its own state', () => {
    const retrieving = newAnalysis();
    expect(retrieving.timeOutAi(T1, 'timeout')).toBe(false);
    const analyzing = inState('analyzing');
    expect(analyzing.timeOutRetrieval(T1, 'timeout')).toBe(false);
    for (const state of ['ready', 'failed'] as const) {
      const done = inState(state);
      const before = done.snapshot();
      expect(done.timeOutAi(T1, 'timeout')).toBe(false);
      expect(done.timeOutRetrieval(T1, 'timeout')).toBe(false);
      expect(done.snapshot()).toEqual(before);
    }
  });
});

describe('buildReport', () => {
  it('retrieving: basic layer, zero counts, no optional keys', () => {
    expect(buildReport(newAnalysis().snapshot())).toEqual({
      id: 'a-1',
      status: 'retrieving',
      createdAt: T0.toISOString(),
      degraded: false,
      appliedLayers: ['basic'],
      summary: { counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 } },
      findings: [],
    });
  });

  it('composes the layers the plan allows and counts the findings', () => {
    const analysis = newAnalysis({ entitlements: PLAN_CATALOG.free });
    analysis.recordDeterministic(
      deterministic([sampleVulnerabilityFinding, sampleLicenseFinding]),
      T1,
    );
    const report = buildReport(analysis.snapshot());
    expect(report.appliedLayers).toEqual(['basic', 'license-compliance', 'severity-score']);
    expect(report.summary.counts).toEqual({ critical: 0, high: 1, medium: 1, low: 0, info: 0 });
    expect(report.summary.riskScore).toBe(57);
    expect(report.completedAt).toBe(T1.toISOString());
  });

  it('is degraded only when an llm failure hit an analysis that expected AI', () => {
    const expected = newAnalysis();
    expected.recordDeterministic(deterministic(), T0);
    expected.recordFailure(failure('llm', 'llm-error'), T1);
    expect(buildReport(expected.snapshot())).toMatchObject({
      degraded: true,
      degradedReason: 'llm-error',
    });

    const notExpected = newAnalysis({ includeAi: false });
    notExpected.recordDeterministic(deterministic(), T0);
    notExpected.recordFailure(failure('llm', 'llm-error'), T1);
    expect(buildReport(notExpected.snapshot()).degraded).toBe(false);
  });

  it('a retrieval failure puts the message in error and is not degraded', () => {
    const analysis = newAnalysis();
    analysis.recordFailure(failure('retrieval', 'retrieval-error'), T1);
    const report = buildReport(analysis.snapshot());
    expect(report).toMatchObject({
      status: 'failed',
      degraded: false,
      error: { code: 'internal', message: 'boom' },
    });
    expect(report.degradedReason).toBeUndefined();
  });
});
