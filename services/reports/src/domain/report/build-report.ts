import type { AnalysisSnapshot } from '../analysis/analysis-types';
import { composeReport } from './compose-report';
import type {
  DegradedReason,
  Finding,
  ReportLayer,
  ReportSummary,
  ReportView,
  SeverityCounts,
} from './report-types';

function countBySeverity(findings: Finding[]): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}

/**
 * Derives the public report from what an analysis holds so far. The layers come from the plan
 * (`entitlements`), applied at read time through the Decorator chain.
 *
 * `degradedReason` is the failure's reason as received: it is not checked against the three
 * degraded reasons, so an `llm` failure carrying another reason is passed through.
 */
export function buildReport(analysis: AnalysisSnapshot): ReportView {
  const failedRetrieval = analysis.failure?.stage === 'retrieval';
  const degraded =
    analysis.failure !== undefined && analysis.failure.stage === 'llm' && analysis.aiExpected;

  let appliedLayers: ReportLayer[] = ['basic'];
  let summary: ReportSummary = {
    counts: countBySeverity(analysis.deterministic?.findings ?? []),
  };
  let findings: Finding[] = analysis.deterministic?.findings ?? [];

  if (analysis.deterministic) {
    const component = composeReport({
      deterministic: analysis.deterministic,
      ai: analysis.ai,
      entitlements: analysis.entitlements,
    });
    const generated = component.generateContent();
    appliedLayers = [...generated.appliedLayers];
    summary = {
      counts: countBySeverity(generated.findings),
      ...(generated.riskScore !== undefined ? { riskScore: generated.riskScore } : {}),
    };
    findings = [...generated.findings];
  }

  return {
    id: analysis.id,
    status: analysis.status,
    createdAt: analysis.createdAt,
    ...(analysis.completedAt !== undefined ? { completedAt: analysis.completedAt } : {}),
    degraded,
    ...(degraded && analysis.failure
      ? { degradedReason: analysis.failure.reason as DegradedReason }
      : {}),
    appliedLayers,
    summary,
    findings,
    ...(failedRetrieval && analysis.failure
      ? { error: { code: 'internal' as const, message: analysis.failure.message } }
      : {}),
  };
}
