import { SEVERITY_ORDER, type Report, type Severity } from '@gyde/contracts';

/** `none` never fails the run. */
export type FailOn = Severity | 'none';

/**
 * Exit code for findings alone: 1 when the report has a finding at `failOn` severity or worse,
 * otherwise 0. Pure on purpose: the pipeline never touches `process`; the CLI sets the exit code.
 * Usage errors (2) and the degraded policy (3) are the CLI's business.
 */
export function exitCodeForReport(report: Report, failOn: FailOn = 'high'): 0 | 1 {
  if (failOn === 'none') return 0;
  const limit = SEVERITY_ORDER.indexOf(failOn);
  return report.findings.some((f) => SEVERITY_ORDER.indexOf(f.severity) <= limit) ? 1 : 0;
}
