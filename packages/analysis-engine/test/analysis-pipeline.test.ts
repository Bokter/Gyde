import { PLAN_CATALOG, type AnalysisRequest, type Finding, type Report } from '@gyde/contracts';
import { sampleAnalysisRequest, sampleReportReady } from '@gyde/contracts/samples';
import { describe, expect, it } from 'vitest';

import {
  AnalysisPipeline,
  GitHubActionPipeline,
  LocalCLIPipeline,
  type AnalysisGateway,
  type AnalysisToolchainFactory,
} from '../src';

function fakeGateway(calls: string[], overrides: Partial<AnalysisGateway> = {}): AnalysisGateway {
  return {
    verifyKey: async () => {
      calls.push('authenticateKey');
      return { plan: 'pro', entitlements: PLAN_CATALOG.pro };
    },
    submitAnalysis: async () => {
      calls.push('submitAnalysis');
      return { analysisId: 'analysis-1', status: 'pending' };
    },
    getReport: async () => sampleReportReady,
    ...overrides,
  };
}

function fakeToolchain(calls: string[]): AnalysisToolchainFactory {
  return {
    createDependencyParser: () => ({
      parseDependencies: async () => {
        throw new Error('the parser is exercised through the pipeline hook in these tests');
      },
    }),
    createVulnerabilityFetcher: () => ({
      source: 'osv',
      fetchVulnerabilities: async () => {
        calls.push('fetchVulnerabilities');
        return [];
      },
    }),
  };
}

/** Fills the hooks and the still-TODO invariant steps so the ORDER of the template is testable. */
class RecordingPipeline extends AnalysisPipeline {
  constructor(
    private readonly calls: string[],
    gateway: AnalysisGateway,
  ) {
    super({ gateway, toolchain: fakeToolchain(calls) });
  }

  protected async parseDependencies(): Promise<AnalysisRequest> {
    this.calls.push('parseDependencies');
    return sampleAnalysisRequest;
  }

  protected override async analyzeLicenses(): Promise<Finding[]> {
    this.calls.push('analyzeLicenses');
    return [];
  }

  protected override async generateReport(): Promise<Report> {
    this.calls.push('generateReport');
    return sampleReportReady;
  }

  protected async publishResult(): Promise<void> {
    this.calls.push('publishResult');
  }
}

describe('AnalysisPipeline (Template Method)', () => {
  it('runs the steps in the documented order and returns the final report', async () => {
    const calls: string[] = [];
    const report = await new RecordingPipeline(calls, fakeGateway(calls)).runAnalysis();

    expect(calls).toEqual([
      'authenticateKey',
      'parseDependencies',
      'submitAnalysis',
      'fetchVulnerabilities',
      'analyzeLicenses',
      'generateReport',
      'publishResult',
    ]);
    expect(report).toEqual(sampleReportReady);
  });

  it('stops before parsing anything when the API key is rejected', async () => {
    const calls: string[] = [];
    const gateway = fakeGateway(calls, {
      verifyKey: async () => {
        calls.push('authenticateKey');
        throw new Error('invalid API key');
      },
    });

    await expect(new RecordingPipeline(calls, gateway).runAnalysis()).rejects.toThrow(
      'invalid API key',
    );
    expect(calls).toEqual(['authenticateKey']);
  });
});

describe('architecture rule: the template method is final by convention', () => {
  it.each([LocalCLIPipeline, GitHubActionPipeline])(
    '%o does not override runAnalysis',
    (Pipeline) => {
      expect(Object.prototype.hasOwnProperty.call(Pipeline.prototype, 'runAnalysis')).toBe(false);
    },
  );
});
