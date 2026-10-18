import type { AffectedRange, Ecosystem } from '../model';

import { compareVersions, parseVersion } from './version';

/**
 * Is `version` inside an OSV-style `AffectedRange`? Pure; the ecosystem decides how versions
 * are ordered.
 *
 *  - `introduced`: first affected version, inclusive. "0" (or absent) means "from the start".
 *  - `fixed`: first fixed version, EXCLUSIVE upper bound (1.5.0 is not affected by "fixed 1.5.0").
 *  - `lastAffected`: last affected version, inclusive (used when there is no fix).
 *  - `versions`: an explicit list; an independent way to be affected (OR with the bounds).
 *
 * Conservative on purpose: a version, or a bound, that cannot be parsed never matches. A range
 * that says nothing (no bounds, no list) matches nothing either.
 */
export function isVersionAffected(
  ecosystem: Ecosystem,
  version: string,
  range: Pick<AffectedRange, 'introduced' | 'fixed' | 'lastAffected' | 'versions'>,
): boolean {
  const parsed = parseVersion(ecosystem, version);
  if (!parsed) return false;

  if (range.versions?.some((listed) => sameVersion(ecosystem, version, listed))) return true;

  const { introduced, fixed, lastAffected } = range;
  const hasBounds = introduced !== undefined || fixed !== undefined || lastAffected !== undefined;
  if (!hasBounds) return false;

  if (introduced !== undefined && introduced !== '0') {
    const lower = parseVersion(ecosystem, introduced);
    if (!lower || compareVersions(parsed, lower) < 0) return false;
  }
  if (fixed !== undefined) {
    const upper = parseVersion(ecosystem, fixed);
    if (!upper || compareVersions(parsed, upper) >= 0) return false;
  }
  if (lastAffected !== undefined) {
    const upper = parseVersion(ecosystem, lastAffected);
    if (!upper || compareVersions(parsed, upper) > 0) return false;
  }
  return true;
}

function sameVersion(ecosystem: Ecosystem, a: string, b: string): boolean {
  const left = parseVersion(ecosystem, a);
  const right = parseVersion(ecosystem, b);
  return left && right ? compareVersions(left, right) === 0 : a === b;
}
