import type { Dependency, Finding } from '@gyde/contracts';
import { sampleAnalysisRequest, sampleVulnerabilityFinding } from '@gyde/contracts/samples';
import { describe, expect, it } from 'vitest';

import { BaseAnalyzer, type AnalyzerInput } from '../src/domain/analyzers/base-analyzer';

const finding = (overrides: Partial<Finding>): Finding => ({
  ...sampleVulnerabilityFinding,
  ...overrides,
});

/** Minimal analyzer: every "match" is already a finding, so only the template is under test. */
class EchoAnalyzer extends BaseAnalyzer<Dependency, Finding> {
  readonly name = 'vulnerabilities' as const;
  private readonly findings: Finding[];

  constructor(findings: Finding[]) {
    super();
    this.findings = findings;
  }

  protected select(input: AnalyzerInput): Dependency[] {
    return [...input.request.dependencies];
  }

  protected match(): Finding[] {
    return this.findings;
  }

  protected toFinding(match: Finding): Finding {
    return match;
  }
}

const input: AnalyzerInput = { request: sampleAnalysisRequest, knowledge: [] };

describe('BaseAnalyzer (Template Method)', () => {
  it('orders findings by severity, then CVSS, then title', () => {
    const analyzer = new EchoAnalyzer([
      finding({ id: '1', severity: 'low', cvss: 2, title: 'low' }),
      finding({ id: '2', severity: 'critical', cvss: 9.8, title: 'B critical' }),
      finding({ id: '3', severity: 'high', cvss: 7.5, title: 'high' }),
      finding({ id: '4', severity: 'critical', cvss: 9.8, title: 'A critical' }),
      finding({ id: '5', severity: 'critical', cvss: 9.1, title: 'lower cvss critical' }),
      finding({ id: '6', severity: 'info', title: 'info' }),
    ]);

    const { findings } = analyzer.analyze(input);

    expect(findings.map((f) => f.id)).toEqual(['4', '2', '5', '3', '1', '6']);
  });

  it('is deterministic and never mutates its input', () => {
    const analyzer = new EchoAnalyzer([
      finding({ id: 'a', severity: 'medium', title: 'm' }),
      finding({ id: 'b', severity: 'high', title: 'h' }),
    ]);
    const frozen: AnalyzerInput = Object.freeze({
      request: sampleAnalysisRequest,
      knowledge: Object.freeze([]),
    });

    expect(analyzer.analyze(frozen)).toEqual(analyzer.analyze(frozen));
  });

  it('collects the evidence of every finding', () => {
    const analyzer = new EchoAnalyzer([finding({ id: 'a' }), finding({ id: 'b' })]);
    const { evidence } = analyzer.analyze(input);
    expect(evidence).toHaveLength(2);
  });
});

/** Acceptance criteria for Area 3. Turn each `it.todo` into a real test as you build it. */
describe('VulnerabilityAnalyzer', () => {
  it.todo('flags Acme.Serialization 1.4.0 against the sample advisory (introduced 0, fixed 1.5.0)');
  it.todo('does not flag 1.5.0 (the first fixed version) nor later versions');
  it.todo('honors lastAffected and explicit version lists');
  it.todo('matches by ecosystem AND name, never by name alone');
  it.todo('puts the advisory evidence, impact and recommendation in the finding');
});

describe('LicenseAnalyzer', () => {
  it.todo('flags GPL-3.0-only as a copyleft risk for proprietary distribution');
  it.todo('understands SPDX expressions (MIT OR Apache-2.0 is fine, GPL-3.0-only AND MIT is not)');
  it.todo('reports a missing or unknown license as an informational finding');
  it.todo('is gated by entitlements.features.licenseCompliance');
});

describe('CompatibilityAnalyzer', () => {
  it.todo('flags a package that does not support the project game engine version');
  it.todo('takes the SDKs and the target platforms into account');
  it.todo('is gated by entitlements.features.compatibilityAnalysis');
});

describe('RetrieveEvidence use case', () => {
  it.todo('publishes the deterministic result to Reports before involving the LLM');
  it.todo('dispatches to llm-analysis only when the plan allows AI and the client asked for it');
  it.todo('publishes an AnalysisFailure (retrieval-error) when the knowledge cannot be fetched');
  it.todo('keeps working with partialSources=true when the normalization service is degraded');
});
