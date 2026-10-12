import { cleanMultiline } from '@gyde/analysis-engine';

/** Hidden marker that identifies the Gyde comment, so later runs update it instead of adding one. */
export const COMMENT_MARKER = '<!-- gyde-report -->';

/** GitHub rejects comment bodies longer than this. */
export const MAX_COMMENT_LENGTH = 65_536;

const TRUNCATED_NOTE =
  '\n\n---\n_El reporte es demasiado largo para un comentario: el completo está en el resumen del job (pestaña Summary de la ejecución)._';

/**
 * The report text comes from the backend and, through it, from external advisories: untrusted.
 * Control characters are removed and an `@` that starts a word gets a zero-width space, so a
 * crafted package name or advisory cannot mention (and notify) people or teams.
 */
export function sanitizeReport(markdown: string, apiKey: string): string {
  const cleaned = cleanMultiline(markdown).split(apiKey).join('***');
  return cleaned.replace(/(^|[\s(])@(?=[A-Za-z0-9])/gm, '$1@​');
}

/** Marker + report, cut to GitHub's limit with a note pointing to the job summary. */
export function buildCommentBody(report: string): string {
  const body = `${COMMENT_MARKER}\n${report}`;
  if (body.length <= MAX_COMMENT_LENGTH) return body;
  return body.slice(0, MAX_COMMENT_LENGTH - TRUNCATED_NOTE.length) + TRUNCATED_NOTE;
}
