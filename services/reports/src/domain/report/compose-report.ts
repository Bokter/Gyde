import type { AiResult, DeterministicResult, Entitlements } from '@gyde/contracts';

import { BasicAnalysisReport } from './basic-analysis-report';
import { AiEnrichmentDecorator } from './decorators/ai-enrichment.decorator';
import { LicenseComplianceDecorator } from './decorators/license-compliance.decorator';
import { SeverityScoreDecorator } from './decorators/severity-score.decorator';
import type { ReportComponent } from './report-component';

export interface ComposeReportInput {
  deterministic: DeterministicResult;
  /** Present only when llm-analysis answered. */
  ai?: AiResult;
  entitlements: Entitlements;
}

/**
 * Builds the decorator chain that the plan of the API key allows, at runtime:
 *
 *   BasicAnalysisReport                         (always)
 *   └ LicenseComplianceDecorator                (features.licenseCompliance)
 *     └ AiEnrichmentDecorator                   (features.aiEnrichment AND input.ai present)
 *       └ SeverityScoreDecorator                (features.severityScoring, always last)
 *
 * Plan table (from PLAN_CATALOG):
 *   free:   licenseCompliance ✓ | aiEnrichment ✗ | severityScoring ✓  (never AI)
 *   pro:    licenseCompliance ✓ | aiEnrichment ✓  | severityScoring ✓  (AI only if present)
 *   studio: licenseCompliance ✓ | aiEnrichment ✓  | severityScoring ✓  (AI only if present)
 */
export function composeReport(input: ComposeReportInput): ReportComponent {
  const {
    deterministic,
    ai,
    entitlements: { features },
  } = input;

  let component: ReportComponent = new BasicAnalysisReport(deterministic.findings);

  if (features.licenseCompliance) {
    component = new LicenseComplianceDecorator(component);
  }

  if (features.aiEnrichment && ai !== undefined) {
    component = new AiEnrichmentDecorator(component, ai);
  }

  if (features.severityScoring) {
    component = new SeverityScoreDecorator(component);
  }

  return component;
}
