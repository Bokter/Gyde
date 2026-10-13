import type { AiResult, DeterministicResult, Entitlements } from '@gyde/contracts';

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
 * TODO(area-4): implement and test every plan (free / pro / studio) with and without `ai`.
 */
export function composeReport(_input: ComposeReportInput): ReportComponent {
  throw new Error('TODO(area-4): composeReport is not implemented yet');
}
