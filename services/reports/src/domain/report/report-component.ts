import type { Finding, ReportLayer } from '@gyde/contracts';

/** What the Decorator chain builds up: the findings plus the layers that touched them. */
export interface ReportContent {
  findings: Finding[];
  appliedLayers: ReportLayer[];
  /** 0-100. Set by the severity-score layer. */
  riskScore?: number;
}

/**
 * DECORATOR (architecture doc, "Patrones de diseño 3"), Component.
 *
 * The base report can be enriched with extra layers depending on the plan of the API key
 * (entitlements) without a class explosion (AIReport, LicenseReport, AILicenseSeverityReport…).
 * Every layer wraps another `ReportComponent` and adds its part.
 */
export interface ReportComponent {
  generateContent(): ReportContent;
}
