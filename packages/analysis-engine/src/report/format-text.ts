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

/**
 * Report text comes from the backend and, through it, from external advisories: it is untrusted.
 * Control characters (ESC and the rest of C0/C1, DEL) are removed so a crafted title cannot
 * rewrite the user's terminal; line breaks and tabs inside a field become a space.
 */
function clean(text: string): string {
  // eslint-disable-next-line no-control-regex -- removing control characters is the point
  return text.replace(/[\t\r\n]+/g, ' ').replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
}

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
  const lines: string[] = [`Gyde · análisis ${clean(report.id)}`, `Estado: ${report.status}`];

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
      ? ` — ${clean(finding.dependency.name)}@${clean(finding.dependency.version)}`
      : '';
    lines.push('', `[${SEVERITY_LABEL[finding.severity]}] ${clean(finding.title)}${dep}`);
    for (const evidence of finding.evidence) {
      lines.push(`  Evidencia (${clean(evidence.source)}): ${clean(evidence.summary)}`);
    }
    if (finding.impact) lines.push(`  Impacto: ${clean(finding.impact)}`);
    if (finding.recommendation) lines.push(`  Recomendación: ${clean(finding.recommendation)}`);
    if (finding.aiExplanation) lines.push(`  IA: ${clean(finding.aiExplanation)}`);
  }
  return lines.join('\n');
}
