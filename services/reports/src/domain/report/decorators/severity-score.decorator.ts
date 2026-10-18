import type { ReportContent } from '../report-component';
import { ReportDecorator } from '../report-decorator';
import type { Severity } from '../report-types';

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 10,
  high: 7,
  medium: 4,
  low: 1,
  info: 0,
};

/**
 * ConcreteDecorator: impact metrics. Computes `riskScore` (0-100) from the severities and CVSS of
 * the findings. Deterministic: no network, no LLM.
 *
 * Formula (two components, max 100):
 *   1. Severity weight (up to 90 pts): weighted average of severity levels relative to all-critical.
 *   2. CVSS bonus (up to 10 pts): average CVSS of findings that have one, scaled to 10.
 *
 * Gate: `entitlements.features.severityScoring`. Runs LAST so the score covers whatever the
 * previous layers added.
 */
export class SeverityScoreDecorator extends ReportDecorator {
  override generateContent(): ReportContent {
    const inner = super.generateContent();
    const { findings } = inner;

    let riskScore = 0;

    if (findings.length > 0) {
      // 1. Severity component (up to 90 pts)
      const totalWeight = findings.reduce((s, f) => s + SEVERITY_WEIGHT[f.severity], 0);
      const maxWeight = findings.length * SEVERITY_WEIGHT.critical;
      const severityScore = maxWeight > 0 ? (totalWeight / maxWeight) * 90 : 0;

      // 2. CVSS bonus (up to 10 pts)
      const cvssFindings = findings.filter((f) => f.cvss !== undefined);
      const avgCvss =
        cvssFindings.length > 0
          ? cvssFindings.reduce((s, f) => s + (f.cvss ?? 0), 0) / cvssFindings.length
          : 0;
      const cvssBonus = (avgCvss / 10) * 10;

      riskScore = Math.min(100, Math.round(severityScore + cvssBonus));
    }

    return {
      ...inner,
      riskScore,
      appliedLayers: [...inner.appliedLayers, 'severity-score'],
    };
  }
}
