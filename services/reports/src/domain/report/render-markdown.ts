import type { Report } from '@gyde/contracts';

/**
 * Renders a report as Markdown for the CLI, the pull request comment and the web viewer:
 * severity-ordered findings, each with evidence, impact and recommendation, and a clear banner
 * when the report is degraded (what is missing and why).
 *
 * Pure function. TODO(area-4): implement.
 */
export function renderMarkdown(_report: Report): string {
  throw new Error('TODO(area-4): renderMarkdown is not implemented yet');
}
