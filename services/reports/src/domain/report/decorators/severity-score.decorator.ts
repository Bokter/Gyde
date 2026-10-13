import type { ReportContent } from '../report-component';
import { ReportDecorator } from '../report-decorator';

/**
 * ConcreteDecorator: impact metrics. Computes `riskScore` (0-100) from the severities and CVSS of
 * the findings, plus an effort/cost estimate to remediate. Deterministic: no network, no LLM.
 *
 * TODO(area-4): implement. Gate: `entitlements.features.severityScoring`. It runs LAST so the score
 * covers whatever the previous layers added.
 */
export class SeverityScoreDecorator extends ReportDecorator {
  override generateContent(): ReportContent {
    throw new Error('TODO(area-4): SeverityScoreDecorator.generateContent is not implemented yet');
  }
}
