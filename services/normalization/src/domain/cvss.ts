import type { Severity } from '@gyde/contracts';

/**
 * CVSS v3.0 / v3.1 base score, computed from a vector string such as
 * `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H`.
 *
 * Some sources (OSV) publish only the vector, not the number, and the rest of the system works with
 * a numeric `cvss`. Pure and deterministic. Only the base metrics count: temporal and environmental
 * metrics describe a moment or a deployment, not the advisory. Other CVSS versions are not
 * supported (the function answers `undefined`).
 */

const WEIGHTS = {
  AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
  AC: { L: 0.77, H: 0.44 },
  UI: { N: 0.85, R: 0.62 },
  CIA: { H: 0.56, L: 0.22, N: 0 },
  PR_UNCHANGED: { N: 0.85, L: 0.62, H: 0.27 },
  PR_CHANGED: { N: 0.85, L: 0.68, H: 0.5 },
} as const;

/** Own-property lookup, so a value like "constructor" is never taken for a metric value. */
function weight(
  table: Readonly<Record<string, number>>,
  value: string | undefined,
): number | undefined {
  return value !== undefined && Object.hasOwn(table, value) ? table[value] : undefined;
}

/** CVSS 3.1 "Roundup": smallest number, to one decimal, that is >= the input, free of float noise. */
function roundUp31(value: number): number {
  const scaled = Math.round(value * 100_000);
  return scaled % 10_000 === 0 ? scaled / 100_000 : (Math.floor(scaled / 10_000) + 1) / 10;
}

/** CVSS 3.0 "Roundup": plain ceiling to one decimal. */
function roundUp30(value: number): number {
  return Math.ceil(value * 10) / 10;
}

function parseMetrics(
  vector: string,
): { version: '3.0' | '3.1'; metrics: Map<string, string> } | undefined {
  const [prefix, ...parts] = vector.trim().split('/');
  if (prefix !== 'CVSS:3.0' && prefix !== 'CVSS:3.1') return undefined;

  const metrics = new Map<string, string>();
  for (const part of parts) {
    const [key, value, ...rest] = part.split(':');
    if (!key || !value || rest.length > 0 || metrics.has(key)) return undefined;
    metrics.set(key, value);
  }
  return { version: prefix === 'CVSS:3.0' ? '3.0' : '3.1', metrics };
}

/** Base score (0.0 to 10.0), or `undefined` when the vector is malformed or not CVSS v3.x. */
export function cvssV3BaseScore(vector: string): number | undefined {
  const parsed = parseMetrics(vector);
  if (!parsed) return undefined;
  const { version, metrics } = parsed;

  const scope = metrics.get('S');
  if (scope !== 'U' && scope !== 'C') return undefined;
  const changed = scope === 'C';

  const av = weight(WEIGHTS.AV, metrics.get('AV'));
  const ac = weight(WEIGHTS.AC, metrics.get('AC'));
  const ui = weight(WEIGHTS.UI, metrics.get('UI'));
  const pr = weight(changed ? WEIGHTS.PR_CHANGED : WEIGHTS.PR_UNCHANGED, metrics.get('PR'));
  const c = weight(WEIGHTS.CIA, metrics.get('C'));
  const i = weight(WEIGHTS.CIA, metrics.get('I'));
  const a = weight(WEIGHTS.CIA, metrics.get('A'));
  if (
    av === undefined ||
    ac === undefined ||
    ui === undefined ||
    pr === undefined ||
    c === undefined ||
    i === undefined ||
    a === undefined
  ) {
    return undefined;
  }

  const iss = 1 - (1 - c) * (1 - i) * (1 - a);
  const impact = changed ? 7.52 * (iss - 0.029) - 3.25 * (iss - 0.02) ** 15 : 6.42 * iss;
  if (impact <= 0) return 0;

  const exploitability = 8.22 * av * ac * pr * ui;
  const roundUp = version === '3.1' ? roundUp31 : roundUp30;
  const raw = changed ? 1.08 * (impact + exploitability) : impact + exploitability;
  return roundUp(Math.min(raw, 10));
}

/** Standard CVSS v3 qualitative rating. A score of 0 ("None") is reported as `info`. */
export function severityFromCvss(score: number): Severity {
  if (score >= 9) return 'critical';
  if (score >= 7) return 'high';
  if (score >= 4) return 'medium';
  if (score > 0) return 'low';
  return 'info';
}
