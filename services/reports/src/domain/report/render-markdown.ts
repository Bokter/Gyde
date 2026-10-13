import type { DegradedReason, Finding, Report, Severity } from '@gyde/contracts';

const SEVERITY_ORDER: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Críticos',
  high: 'Altos',
  medium: 'Medios',
  low: 'Bajos',
  info: 'Informativos',
};

const DEGRADED_REASON_LABEL: Record<DegradedReason, string> = {
  'llm-unavailable': 'servicio de IA no disponible',
  'llm-not-configured': 'clave LLM del estudio no configurada',
  'llm-error': 'error del proveedor de IA',
};

function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+\-.!|])/g, '\\$1');
}

function renderFinding(f: Finding): string {
  const lines: string[] = [];
  lines.push(`### ${escapeMarkdown(f.title)}`);

  if (f.dependency) {
    lines.push(
      `**Paquete:** \`${f.dependency.ecosystem}/${f.dependency.name}@${f.dependency.version}\``,
    );
  }

  if (f.evidence.length > 0) {
    lines.push('**Evidencia:**');
    for (const ev of f.evidence) {
      const ref = ev.url ? ` ([fuente](${ev.url}))` : '';
      lines.push(`- ${escapeMarkdown(ev.summary)}${ref}`);
    }
  }

  if (f.impact) {
    lines.push(`**Impacto:** ${escapeMarkdown(f.impact)}`);
  }

  if (f.recommendation) {
    lines.push(`**Recomendación:** ${escapeMarkdown(f.recommendation)}`);
  }

  if (f.aiExplanation) {
    lines.push(`**Explicación IA:** ${escapeMarkdown(f.aiExplanation)}`);
  }

  if (f.references.length > 0) {
    lines.push('**Referencias:** ' + f.references.map((r) => `[${r}](${r})`).join(', '));
  }

  return lines.join('\n\n');
}

/**
 * Renders a report as Markdown for the CLI, the pull request comment and the web viewer.
 *
 * Structure:
 *   1. Title with analysis id and date.
 *   2. Degraded banner (only when degraded): what is missing, why, note that deterministic
 *      findings are still valid.
 *   3. Summary: severity counts and riskScore (only when the severity-score layer ran).
 *   4. "Cumplimiento de licencias" section grouping license findings (only when
 *      license-compliance layer ran).
 *   5. Findings ordered by severity (critical → info); within each severity, in the order
 *      produced by the decorator chain (AI-ranked first when AI enrichment ran).
 *
 * Pure function.
 */
export function renderMarkdown(report: Report): string {
  const sections: string[] = [];

  // --- 1. Title ---
  const date = report.completedAt ?? report.createdAt;
  sections.push(`# Reporte de análisis — \`${report.id}\``);
  sections.push(`_Generado el ${date.slice(0, 10)}_`);

  // --- 2. Degraded banner ---
  if (report.degraded && report.degradedReason) {
    const reason = DEGRADED_REASON_LABEL[report.degradedReason];
    sections.push(
      `> ⚠️ **Reporte degradado** · ${reason}\n` +
        `> \n` +
        `> La capa de IA no pudo ejecutarse. Los hallazgos determinísticos siguen siendo válidos.`,
    );
  }

  // --- 3. Summary ---
  const { counts } = report.summary;
  const hasScore = report.appliedLayers.includes('severity-score');
  const scoreText =
    hasScore && report.summary.riskScore !== undefined
      ? ` · **Riesgo:** ${report.summary.riskScore}/100`
      : '';
  sections.push(
    `**Estado:** ${report.status}${scoreText}\n\n` +
      `| Críticos | Altos | Medios | Bajos | Informativos |\n` +
      `|:---:|:---:|:---:|:---:|:---:|\n` +
      `| ${counts.critical} | ${counts.high} | ${counts.medium} | ${counts.low} | ${counts.info} |`,
  );

  // --- 4. License compliance section (when that layer ran) ---
  if (report.appliedLayers.includes('license-compliance')) {
    const licenseFindings = report.findings.filter((f) => f.kind === 'license');
    if (licenseFindings.length > 0) {
      sections.push('## Cumplimiento de licencias');
      for (const f of licenseFindings) {
        sections.push(renderFinding(f));
      }
    }
  }

  // --- 5. Findings by severity ---
  sections.push('## Hallazgos');

  const bySeverity = new Map<Severity, Finding[]>();
  for (const sev of SEVERITY_ORDER) bySeverity.set(sev, []);
  for (const f of report.findings) {
    // Skip license findings already shown in the compliance section.
    if (report.appliedLayers.includes('license-compliance') && f.kind === 'license') continue;
    bySeverity.get(f.severity)!.push(f);
  }

  let hasAnyFinding = false;
  for (const sev of SEVERITY_ORDER) {
    const group = bySeverity.get(sev)!;
    if (group.length === 0) continue;
    hasAnyFinding = true;
    sections.push(`### ${SEVERITY_LABEL[sev]} (${group.length})`);
    for (const f of group) {
      sections.push(renderFinding(f));
    }
  }

  if (!hasAnyFinding) {
    sections.push('_No se encontraron hallazgos._');
  }

  return sections.join('\n\n');
}
