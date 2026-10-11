import { SEVERITY_ORDER, type DegradedReason, type Finding, type Report } from '@gyde/contracts';

const SEVERITY_LABEL: Record<Finding['severity'], string> = {
  critical: 'CRÍTICA',
  high: 'ALTA',
  medium: 'MEDIA',
  low: 'BAJA',
  info: 'INFO',
};

const DEGRADED_REASON: Record<DegradedReason, string> = {
  'llm-unavailable': 'el servicio de IA no está disponible',
  'llm-not-configured': 'el estudio aún no configuró una llave de IA',
  'llm-error': 'el proveedor de IA respondió con un error',
};

/** Most severe first, then highest CVSS, then title (stable and deterministic). */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      (b.cvss ?? 0) - (a.cvss ?? 0) ||
      a.title.localeCompare(b.title),
  );
}

/**
 * Plain-text rendering of a report for the terminal (interface text: Spanish). Findings are
 * ordered by severity; a degraded report states it up front.
 */
export function formatReportText(report: Report): string {
  const lines: string[] = [`Gyde · análisis ${report.id}`, `Estado: ${report.status}`];

  if (report.degraded) {
    const why = report.degradedReason ? ` (${DEGRADED_REASON[report.degradedReason]})` : '';
    lines.push(
      `⚠ Resultado degradado${why}: falta la explicación de IA; los hallazgos siguen siendo válidos.`,
    );
  }

  const { counts, riskScore } = report.summary;
  const breakdown = SEVERITY_ORDER.map((s) => `${counts[s]} ${SEVERITY_LABEL[s].toLowerCase()}`);
  lines.push(
    `Resumen: ${breakdown.join(', ')}${riskScore === undefined ? '' : ` · riesgo ${riskScore}/100`}`,
  );

  const findings = sortFindings(report.findings);
  if (findings.length === 0) {
    lines.push('', 'Sin hallazgos.');
    return lines.join('\n');
  }

  for (const finding of findings) {
    const dep = finding.dependency
      ? ` — ${finding.dependency.name}@${finding.dependency.version}`
      : '';
    lines.push('', `[${SEVERITY_LABEL[finding.severity]}] ${finding.title}${dep}`);
    for (const evidence of finding.evidence) {
      lines.push(`  Evidencia (${evidence.source}): ${evidence.summary}`);
    }
    if (finding.impact) lines.push(`  Impacto: ${finding.impact}`);
    if (finding.recommendation) lines.push(`  Recomendación: ${finding.recommendation}`);
    if (finding.aiExplanation) lines.push(`  IA: ${finding.aiExplanation}`);
  }
  return lines.join('\n');
}
