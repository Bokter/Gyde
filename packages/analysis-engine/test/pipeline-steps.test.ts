import { resolve } from 'node:path';

import { AnalysisRequest, PLAN_CATALOG, type Finding, type Report } from '@gyde/contracts';
import {
  sampleLicenseFinding,
  sampleReportDegraded,
  sampleReportReady,
  sampleVulnerabilityFinding,
} from '@gyde/contracts/samples';
import { describe, expect, it } from 'vitest';

import {
  AnalysisWaitError,
  LocalCLIPipeline,
  OsvVulnerabilityFetcher,
  createToolchainFactory,
  exitCodeForReport,
  formatReportText,
  waitForReport,
  type AnalysisGateway,
} from '../src';

const UNITY_SAMPLE = resolve(import.meta.dirname, '../../../fixtures/projects/unity-sample');

const osvVulnerability: Finding = {
  ...sampleVulnerabilityFinding,
  evidence: [{ source: 'osv', trust: 'high', summary: 'Versions below 1.5.0 are unsafe.' }],
};
const ghsaOnlyVulnerability: Finding = {
  ...sampleVulnerabilityFinding,
  id: 'finding-vuln-ghsa',
  evidence: [{ source: 'ghsa', trust: 'high', summary: 'Only GHSA knows this one.' }],
};

function reportWith(status: Report['status'], overrides: Partial<Report> = {}): Report {
  return { ...sampleReportReady, status, ...overrides };
}

/** Gateway that answers the given reports in order (the last one repeats) and counts the calls. */
function scriptedGateway(reports: Report[]) {
  const state = { getReportCalls: 0, submitted: [] as unknown[] };
  const gateway: AnalysisGateway = {
    verifyKey: async () => ({ plan: 'pro', entitlements: PLAN_CATALOG.pro }),
    submitAnalysis: async (request) => {
      state.submitted.push(request);
      return { analysisId: sampleReportReady.id, status: 'pending' };
    },
    getReport: async () => {
      const report = reports[Math.min(state.getReportCalls, reports.length - 1)] as Report;
      state.getReportCalls += 1;
      return report;
    },
    getMarkdown: async () => '# report',
  };
  return { gateway, state };
}

/** A sleep that records the requested delays and never waits. */
function fakeSleep() {
  const delays: number[] = [];
  return { delays, sleep: async (ms: number) => void delays.push(ms) };
}

const job = () => ({ analysisId: sampleReportReady.id });

describe('waitForReport', () => {
  it('polls through retrieving and analyzing until the report is ready', async () => {
    const { gateway, state } = scriptedGateway([
      reportWith('retrieving'),
      reportWith('analyzing'),
      reportWith('ready'),
    ]);
    const { sleep, delays } = fakeSleep();

    const report = await waitForReport(gateway, job(), 'ready', { pollIntervalMs: 250, sleep });

    expect(report.status).toBe('ready');
    expect(state.getReportCalls).toBe(3);
    expect(delays).toEqual([250, 250]);
  });

  it('gives up with a clear error when the stage is not reached in time', async () => {
    const { gateway } = scriptedGateway([reportWith('retrieving')]);
    const { sleep } = fakeSleep();

    const error = await waitForReport(gateway, job(), 'ready', {
      pollIntervalMs: 100,
      timeoutMs: 300,
      sleep,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AnalysisWaitError);
    expect((error as AnalysisWaitError).reason).toBe('timeout');
    expect((error as Error).message).toContain('last status: retrieving');
  });

  it('raises a clear error carrying the report message when the analysis ends failed', async () => {
    const { gateway } = scriptedGateway([
      reportWith('failed', { error: { code: 'internal', message: 'Retrieval is unavailable' } }),
    ]);

    await expect(
      waitForReport(gateway, job(), 'ready', { sleep: fakeSleep().sleep }),
    ).rejects.toThrow(/failed: Retrieval is unavailable/);
  });

  it('asks the gateway once for the three remote stages of a run', async () => {
    const { gateway, state } = scriptedGateway([
      reportWith('ready', { findings: [osvVulnerability, sampleLicenseFinding] }),
    ]);
    const factory = createToolchainFactory('unity', { projectRoot: UNITY_SAMPLE, gateway });
    const pipeline = new LocalCLIPipeline({
      gateway,
      toolchain: factory,
      projectRoot: UNITY_SAMPLE,
      clientVersion: '0.0.0',
    });

    await pipeline.runAnalysis();

    expect(state.getReportCalls).toBe(1);
  });
});

describe('remote stages', () => {
  it('the OSV fetcher keeps only vulnerabilities whose evidence comes from OSV', async () => {
    const { gateway } = scriptedGateway([
      reportWith('analyzing', {
        findings: [osvVulnerability, ghsaOnlyVulnerability, sampleLicenseFinding],
      }),
    ]);

    const findings = await new OsvVulnerabilityFetcher(gateway).fetchVulnerabilities(job());

    expect(findings.map((f) => f.id)).toEqual([osvVulnerability.id]);
  });

  it('analyzeLicenses returns the license findings as soon as the deterministic stage exists', async () => {
    const { gateway } = scriptedGateway([
      reportWith('analyzing', { findings: [osvVulnerability, sampleLicenseFinding] }),
    ]);
    const factory = createToolchainFactory('unity', { projectRoot: UNITY_SAMPLE, gateway });
    class Probe extends LocalCLIPipeline {
      licenses() {
        return this.analyzeLicenses(job());
      }
    }
    const probe = new Probe({
      gateway,
      toolchain: factory,
      projectRoot: UNITY_SAMPLE,
      clientVersion: '0.0.0',
    });

    expect((await probe.licenses()).map((f) => f.kind)).toEqual(['license']);
  });

  it('serves a degraded report when the gateway only has the cached one', async () => {
    const { gateway } = scriptedGateway([sampleReportDegraded]);
    const output: string[] = [];
    const pipeline = new LocalCLIPipeline({
      gateway,
      toolchain: createToolchainFactory('unity', { projectRoot: UNITY_SAMPLE, gateway }),
      projectRoot: UNITY_SAMPLE,
      clientVersion: '0.0.0',
      output: (text) => void output.push(text),
    });

    const report = await pipeline.runAnalysis();

    expect(report.degraded).toBe(true);
    expect(output.join('\n')).toContain('Resultado degradado');
  });
});

describe('report text and exit code', () => {
  it('lists findings from the most to the least severe', () => {
    const critical: Finding = { ...osvVulnerability, id: 'c', severity: 'critical', title: 'Crit' };
    const low: Finding = { ...sampleLicenseFinding, id: 'l', severity: 'low', title: 'Lowly' };
    const text = formatReportText(
      reportWith('ready', { findings: [low, sampleLicenseFinding, critical] }),
    );

    const order = ['[CRÍTICA] Crit', '[MEDIA]', '[BAJA] Lowly'].map((s) => text.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('strips terminal control sequences from untrusted report text', () => {
    const hostile: Finding = {
      ...osvVulnerability,
      title: 'Safe\u001b[2J\u001b]0;pwned\u0007 title',
      impact: 'line one\nline two\u009b31m',
    };
    const text = formatReportText(reportWith('ready', { findings: [hostile] }));

    // eslint-disable-next-line no-control-regex -- asserting that no control character survives
    expect(text).not.toMatch(/[\u001b\u0007\u009b]/);
    expect(text).toContain('Safe[2J]0;pwned title');
    expect(text).toContain('Impacto: line one line two31m');
  });

  it('fails only from the --fail-on severity upwards', () => {
    const report = reportWith('ready', { findings: [sampleVulnerabilityFinding] }); // high
    expect(exitCodeForReport(report)).toBe(1);
    expect(exitCodeForReport(report, 'critical')).toBe(0);
    expect(exitCodeForReport(report, 'none')).toBe(0);
    expect(exitCodeForReport(reportWith('ready', { findings: [sampleLicenseFinding] }))).toBe(0);
  });

  it('prints nothing when no output is injected', async () => {
    const { gateway } = scriptedGateway([reportWith('ready')]);
    const pipeline = new LocalCLIPipeline({
      gateway,
      toolchain: createToolchainFactory('unity', { projectRoot: UNITY_SAMPLE, gateway }),
      projectRoot: UNITY_SAMPLE,
      clientVersion: '0.0.0',
    });
    await expect(pipeline.runAnalysis()).resolves.toMatchObject({ status: 'ready' });
  });
});

describe('privacy, end to end on unity-sample', () => {
  it('sends one request with only names, versions and licenses', async () => {
    const { gateway, state } = scriptedGateway([reportWith('ready')]);
    const pipeline = new LocalCLIPipeline({
      gateway,
      toolchain: createToolchainFactory('unity', { projectRoot: UNITY_SAMPLE, gateway }),
      projectRoot: UNITY_SAMPLE,
      clientVersion: '1.2.3',
      includeAi: false,
    });

    await pipeline.runAnalysis();

    expect(state.submitted).toHaveLength(1);
    const body = JSON.stringify(state.submitted[0]);
    expect(AnalysisRequest.safeParse(state.submitted[0]).success).toBe(true);
    expect(body).not.toContain('PROPRIETARY_MARKER_DO_NOT_SEND');
    expect(body).not.toContain('Player.cs');
    expect(body).not.toContain('Assets/Scripts');
    expect(body).not.toContain(UNITY_SAMPLE);
    expect(body).not.toMatch(/[A-Za-z]:\\|\/Users\//);
    expect(state.submitted[0]).toMatchObject({
      client: { kind: 'cli', version: '1.2.3' },
      options: { includeAi: false },
    });
  });
});
