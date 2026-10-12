import type { AiResult, DeterministicResult, Finding, Report, ReportLayer } from '@gyde/contracts';
import { PLAN_CATALOG } from '@gyde/contracts';
import { sampleLicenseFinding, sampleVulnerabilityFinding } from '@gyde/contracts/samples';
import { describe, expect, it } from 'vitest';

import { BasicAnalysisReport } from '../src/domain/report/basic-analysis-report';
import { AiEnrichmentDecorator } from '../src/domain/report/decorators/ai-enrichment.decorator';
import { LicenseComplianceDecorator } from '../src/domain/report/decorators/license-compliance.decorator';
import { SeverityScoreDecorator } from '../src/domain/report/decorators/severity-score.decorator';
import { composeReport } from '../src/domain/report/compose-report';
import { renderMarkdown } from '../src/domain/report/render-markdown';
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

/** Acceptance criteria for Area 4. */
describe('concrete decorators and composeReport', () => {
  it('SeverityScoreDecorator computes riskScore (0-100) from severity and CVSS, deterministically', () => {
    // sampleVulnerabilityFinding: severity=high, cvss=7.5
    // sampleLicenseFinding: severity=medium, cvss=undefined
    const base = new BasicAnalysisReport(findings);
    const decorated = new SeverityScoreDecorator(base);
    const content = decorated.generateContent();

    expect(content.riskScore).toBeGreaterThanOrEqual(0);
    expect(content.riskScore).toBeLessThanOrEqual(100);
    expect(typeof content.riskScore).toBe('number');
    expect(content.appliedLayers).toContain('severity-score');

    // Determinism: same input → same output
    expect(decorated.generateContent().riskScore).toBe(content.riskScore);

    // Sanity: mixed high+medium should produce a mid-range score (not 0, not 100)
    expect(content.riskScore).toBeGreaterThan(0);
    expect(content.riskScore).toBeLessThan(100);
  });

  describe('the risk score formula is pinned', () => {
    // score = round(severity part (up to 90) + CVSS part (up to 10)), where
    //   severity part = 90 * sum(weights) / (findings * 10), weights critical 10, high 7, medium 4,
    //   low 1, info 0, and CVSS part = the average CVSS of the findings that have one.
    // The sample finding carries a CVSS of its own: start from it without one.
    const { cvss: _sampleCvss, ...withoutCvss } = sampleVulnerabilityFinding;
    let counter = 0;
    const finding = (severity: Finding['severity'], cvss?: number): Finding => ({
      ...withoutCvss,
      id: `finding-${(counter += 1)}`,
      severity,
      ...(cvss === undefined ? {} : { cvss }),
    });
    const scoreOf = (findings: Finding[]) =>
      new SeverityScoreDecorator(new BasicAnalysisReport(findings)).generateContent().riskScore;

    it('is 0 without findings and for informative findings only', () => {
      expect(scoreOf([])).toBe(0);
      expect(scoreOf([finding('info'), finding('info')])).toBe(0);
    });

    it.each([
      // 90 * 10/10 + 9.8 = 99.8 -> 100
      { name: 'one critical with CVSS 9.8', findings: [finding('critical', 9.8)], score: 100 },
      // 90 * 7/10 + 7.5 = 70.5 -> 71
      { name: 'one high with CVSS 7.5', findings: [finding('high', 7.5)], score: 71 },
      // 90 * 4/10 = 36, and no CVSS
      { name: 'one medium without CVSS', findings: [finding('medium')], score: 36 },
      // 90 * 1/10 + 2 = 11
      { name: 'one low with CVSS 2', findings: [finding('low', 2)], score: 11 },
      // 90 * (7 + 4) / 20 = 49.5, CVSS average of the one that has it (7.5) -> 57
      {
        name: 'a high with CVSS 7.5 and a medium without',
        findings: [finding('high', 7.5), finding('medium')],
        score: 57,
      },
    ])('is $score for $name', ({ findings, score }) => {
      expect(scoreOf(findings)).toBe(score);
    });

    it('is capped at 100', () => {
      expect(scoreOf([finding('critical', 10), finding('critical', 10)])).toBe(100);
    });

    it('is an average, so informative findings dilute a critical one (known limit)', () => {
      // 90 * 10/100 + 10 = 19: one critical among nine informative findings.
      const diluted = [
        finding('critical', 10),
        ...Array.from({ length: 9 }, () => finding('info')),
      ];
      expect(scoreOf(diluted)).toBe(19);
      // Documented in the README of Reports: read the counts by severity next to the score.
    });
  });

  it('SeverityScoreDecorator runs last so the score covers the layers before it', () => {
    // The score must be based on all findings in the chain, including ones added by prior decorators.
    const criticalFinding: Finding = {
      ...sampleVulnerabilityFinding,
      id: 'finding-critical-1',
      severity: 'critical',
      cvss: 10,
    };
    const mixedFindings = [sampleVulnerabilityFinding, criticalFinding]; // high + critical

    const baseWithMixed = new BasicAnalysisReport(mixedFindings);

    // Severity last
    const scoreOfMixed = new SeverityScoreDecorator(baseWithMixed).generateContent().riskScore!;
    // Severity second-to-last (simulated via TagDecorator adding no new findings)
    const tagFirst = new TagDecorator(baseWithMixed, 'license-compliance', 'L');
    const scoreAfterTag = new SeverityScoreDecorator(tagFirst).generateContent().riskScore!;

    // Both should be the same (TagDecorator doesn't add findings, just tags titles)
    // The important check: severity-score is in the appliedLayers at the end
    const layers = new SeverityScoreDecorator(
      new TagDecorator(baseWithMixed, 'license-compliance', 'L'),
    ).generateContent().appliedLayers;

    expect(layers[layers.length - 1]).toBe('severity-score');
    expect(scoreOfMixed).toBeGreaterThan(0);
    expect(scoreAfterTag).toBe(scoreOfMixed);
  });

  it('LicenseComplianceDecorator adds the compliance view for conflicting or unknown licenses', () => {
    // sampleLicenseFinding has no `impact` field (only recommendation set)
    const findingWithoutImpact: Finding = { ...sampleLicenseFinding, impact: undefined };
    const base = new BasicAnalysisReport([findingWithoutImpact]);
    const content = new LicenseComplianceDecorator(base).generateContent();

    expect(content.appliedLayers).toContain('license-compliance');

    const licenseFinding = content.findings.find((f) => f.kind === 'license');
    expect(licenseFinding).toBeDefined();
    // Impact was missing; decorator should fill it defensively
    expect(licenseFinding!.impact).toBeTruthy();
    // Recommendation was already set; decorator must not overwrite it
    expect(licenseFinding!.recommendation).toBe(findingWithoutImpact.recommendation);

    // Non-license findings are untouched
    const vuln = new BasicAnalysisReport([sampleVulnerabilityFinding]);
    const vulnContent = new LicenseComplianceDecorator(vuln).generateContent();
    expect(vulnContent.findings[0]).toEqual(sampleVulnerabilityFinding);
  });

  it('AiEnrichmentDecorator merges explanations by finding id and honors the AI priority order', () => {
    // AI lists license finding FIRST (higher AI priority), then vulnerability
    const aiResult: AiResult = {
      analysisId: 'a-1',
      findings: [
        {
          ...sampleLicenseFinding,
          aiExplanation: 'GPL can conflict with commercial distribution.',
        },
        {
          ...sampleVulnerabilityFinding,
          aiExplanation: 'Update to patch the deserialization bug.',
        },
      ],
    };

    const base = new BasicAnalysisReport(findings); // vuln first, license second
    const content = new AiEnrichmentDecorator(base, aiResult).generateContent();

    expect(content.appliedLayers).toContain('ai-enrichment');

    // AI order: license (index 0) then vuln (index 1)
    expect(content.findings[0]!.id).toBe(sampleLicenseFinding.id);
    expect(content.findings[0]!.aiExplanation).toBe(
      'GPL can conflict with commercial distribution.',
    );
    expect(content.findings[1]!.id).toBe(sampleVulnerabilityFinding.id);
    expect(content.findings[1]!.aiExplanation).toBe('Update to patch the deserialization bug.');
  });

  it('AiEnrichmentDecorator leaves findings untouched when the AI result has no matching id', () => {
    const aiResult: AiResult = {
      analysisId: 'a-1',
      findings: [
        {
          ...sampleVulnerabilityFinding,
          id: 'non-existent-id',
          aiExplanation: 'This id does not match any deterministic finding.',
        },
      ],
    };

    const base = new BasicAnalysisReport(findings);
    const content = new AiEnrichmentDecorator(base, aiResult).generateContent();

    // AI finding id was hallucinated; both original findings come through unmodified
    expect(content.findings).toHaveLength(2);
    expect(content.findings[0]).toEqual(sampleVulnerabilityFinding);
    expect(content.findings[1]).toEqual(sampleLicenseFinding);
    expect(content.findings[0]!.aiExplanation).toBeUndefined();
  });

  it('composeReport: free plan = basic + license + severity, never the AI layer', () => {
    const deterministic: DeterministicResult = {
      analysisId: 'a-1',
      findings,
      evidence: [],
      coverage: { vulnerabilities: true, compatibility: false, licenses: true },
      partialSources: false,
    };
    const aiResult: AiResult = { analysisId: 'a-1', findings: [] };

    const component = composeReport({
      deterministic,
      ai: aiResult, // present, but free plan must ignore it
      entitlements: PLAN_CATALOG.free,
    });
    const content = component.generateContent();

    expect(content.appliedLayers).toContain('basic');
    expect(content.appliedLayers).toContain('license-compliance');
    expect(content.appliedLayers).toContain('severity-score');
    expect(content.appliedLayers).not.toContain('ai-enrichment');
    // severity-score is last
    expect(content.appliedLayers[content.appliedLayers.length - 1]).toBe('severity-score');
  });

  it('composeReport: pro and studio plans add the AI layer only when an AiResult is present', () => {
    const deterministic: DeterministicResult = {
      analysisId: 'a-1',
      findings,
      evidence: [],
      coverage: { vulnerabilities: true, compatibility: true, licenses: true },
      partialSources: false,
    };

    // Pro WITHOUT ai → no ai-enrichment layer
    const withoutAi = composeReport({ deterministic, entitlements: PLAN_CATALOG.pro });
    const layersWithoutAi = withoutAi.generateContent().appliedLayers;
    expect(layersWithoutAi).not.toContain('ai-enrichment');

    // Pro WITH ai → ai-enrichment layer present, before severity-score
    const aiResult: AiResult = { analysisId: 'a-1', findings: [] };
    const withAi = composeReport({ deterministic, ai: aiResult, entitlements: PLAN_CATALOG.pro });
    const layersWithAi = withAi.generateContent().appliedLayers;
    expect(layersWithAi).toContain('ai-enrichment');
    expect(layersWithAi[layersWithAi.length - 1]).toBe('severity-score');

    // Studio behaves the same as pro
    const studioWithAi = composeReport({
      deterministic,
      ai: aiResult,
      entitlements: PLAN_CATALOG.studio,
    });
    expect(studioWithAi.generateContent().appliedLayers).toContain('ai-enrichment');
  });

  it('renderMarkdown shows a degraded banner explaining what is missing and why', () => {
    const report: Report = {
      id: 'analysis-0002',
      status: 'ready',
      createdAt: '2026-10-11T12:00:00Z',
      completedAt: '2026-10-11T12:00:15Z',
      degraded: true,
      degradedReason: 'llm-not-configured',
      appliedLayers: ['basic', 'license-compliance', 'severity-score'],
      summary: {
        counts: { critical: 0, high: 1, medium: 1, low: 0, info: 0 },
        riskScore: 45,
      },
      findings: [sampleVulnerabilityFinding, sampleLicenseFinding],
    };

    const md = renderMarkdown(report);

    // Must contain the degraded banner
    expect(md).toContain('Reporte degradado');
    // Reason in Spanish for llm-not-configured
    expect(md).toContain('clave LLM del estudio no configurada');
    // The deterministic findings are valid note
    expect(md).toContain('determinísticos');
    // riskScore present in summary (layer ran)
    expect(md).toContain('45/100');
    // License compliance section present
    expect(md).toContain('Cumplimiento de licencias');
    // analysis id in title
    expect(md).toContain('analysis-0002');
  });
});
