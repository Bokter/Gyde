import type { ReportLayer } from '@gyde/contracts';
import { sampleLicenseFinding, sampleVulnerabilityFinding } from '@gyde/contracts/samples';
import { describe, expect, it } from 'vitest';

import { BasicAnalysisReport } from '../src/domain/report/basic-analysis-report';
import type { ReportComponent, ReportContent } from '../src/domain/report/report-component';
import { ReportDecorator } from '../src/domain/report/report-decorator';

/** Stand-in for a real layer: tags every title so the order of wrapping is observable. */
class TagDecorator extends ReportDecorator {
  private readonly layer: ReportLayer;
  private readonly tag: string;

  constructor(wrapped: ReportComponent, layer: ReportLayer, tag: string) {
    super(wrapped);
    this.layer = layer;
    this.tag = tag;
  }

  override generateContent(): ReportContent {
    const inner = super.generateContent();
    return {
      ...inner,
      findings: inner.findings.map((finding) => ({
        ...finding,
        title: `${finding.title} [${this.tag}]`,
      })),
      appliedLayers: [...inner.appliedLayers, this.layer],
    };
  }
}

const findings = [sampleVulnerabilityFinding, sampleLicenseFinding];

describe('Decorator pattern (reports)', () => {
  it('the basic report exposes the deterministic findings and the basic layer', () => {
    const content = new BasicAnalysisReport(findings).generateContent();
    expect(content.findings).toEqual(findings);
    expect(content.appliedLayers).toEqual(['basic']);
  });

  it('a decorator without behavior is transparent', () => {
    const base = new BasicAnalysisReport(findings);
    const plain = new (class extends ReportDecorator {})(base);
    expect(plain.generateContent()).toEqual(base.generateContent());
  });

  it('wraps layers in the order they are composed, without a class per combination', () => {
    const base = new BasicAnalysisReport(findings);
    const chain = new TagDecorator(
      new TagDecorator(base, 'license-compliance', 'license'),
      'ai-enrichment',
      'ai',
    );

    const content = chain.generateContent();

    expect(content.appliedLayers).toEqual(['basic', 'license-compliance', 'ai-enrichment']);
    expect(content.findings[0]?.title).toMatch(/\[license\] \[ai\]$/);
  });

  it('can be composed dynamically from a list of layers (what composeReport will do)', () => {
    const layers: ReportLayer[] = ['license-compliance', 'severity-score'];
    const chain = layers.reduce<ReportComponent>(
      (component, layer) => new TagDecorator(component, layer, layer),
      new BasicAnalysisReport(findings),
    );
    expect(chain.generateContent().appliedLayers).toEqual(['basic', ...layers]);
  });

  it('never mutates the content of the wrapped component', () => {
    const base = new BasicAnalysisReport(findings);
    const before = structuredClone(base.generateContent());

    new TagDecorator(base, 'ai-enrichment', 'ai').generateContent();

    expect(base.generateContent()).toEqual(before);
  });
});

/** Acceptance criteria for Area 4. Turn each `it.todo` into a real test as you build it. */
describe('concrete decorators and composeReport', () => {
  it.todo(
    'SeverityScoreDecorator computes riskScore (0-100) from severity and CVSS, deterministically',
  );
  it.todo('SeverityScoreDecorator runs last so the score covers the layers before it');
  it.todo(
    'LicenseComplianceDecorator adds the compliance view for conflicting or unknown licenses',
  );
  it.todo(
    'AiEnrichmentDecorator merges explanations by finding id and honors the AI priority order',
  );
  it.todo('AiEnrichmentDecorator leaves findings untouched when the AI result has no matching id');
  it.todo('composeReport: free plan = basic + license + severity, never the AI layer');
  it.todo('composeReport: pro and studio plans add the AI layer only when an AiResult is present');
  it.todo('renderMarkdown shows a degraded banner explaining what is missing and why');
});
