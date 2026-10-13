import type { Ecosystem } from '@gyde/contracts';

/**
 * Package version parsing and ordering, per ecosystem. Pure and deterministic.
 *
 * NuGet and UPM follow SemVer-like rules; NuGet also allows 4 numeric parts ("1.2.3.4"). The rules
 * applied here:
 *  - missing numeric parts are zero ("1.4" = "1.4.0" = "1.4.0.0");
 *  - a pre-release sorts BEFORE its release ("1.5.0-beta" < "1.5.0");
 *  - pre-release identifiers compare one by one: numbers numerically, below text; text without
 *    regard to case; with all else equal the shorter list is lower;
 *  - build metadata ("+abc") is ignored.
 * A string that does not look like a version parses to `undefined`: the callers decide what that
 * means (the vulnerability analyzer never flags a version it cannot compare).
 */
export interface ParsedVersion {
  /** Numeric parts without leading zeros, kept as text so very large numbers stay exact. */
  readonly numbers: readonly string[];
  /** Pre-release identifiers, empty for a release. */
  readonly prerelease: readonly string[];
}

/** Maximum numeric parts: only NuGet (and Unreal plugins, which often use 4) allow four. */
const MAX_PARTS: Record<Ecosystem, number> = { nuget: 4, upm: 3, unreal: 4, cpp: 4 };

const VERSION = /^v?(\d+(?:\.\d+)*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;

const stripZeros = (digits: string): string => digits.replace(/^0+(?=\d)/, '');

export function parseVersion(ecosystem: Ecosystem, text: string): ParsedVersion | undefined {
  const match = VERSION.exec(text.trim());
  if (!match) return undefined;
  const numbers = match[1]!.split('.').map(stripZeros);
  if (numbers.length > MAX_PARTS[ecosystem]) return undefined;
  const prerelease = match[2] ? match[2].split('.') : [];
  if (prerelease.some((identifier) => identifier === '')) return undefined;
  return { numbers, prerelease };
}

type Order = -1 | 0 | 1;

function compareNumbers(a: string, b: string): Order {
  if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  return a === b ? 0 : a < b ? -1 : 1;
}

const isNumeric = (identifier: string): boolean => /^\d+$/.test(identifier);

function comparePrerelease(a: readonly string[], b: readonly string[]): Order {
  // A release (no pre-release) is higher than any pre-release of the same numbers.
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const left = a[i]!;
    const right = b[i]!;
    const leftNumeric = isNumeric(left);
    const rightNumeric = isNumeric(right);
    if (leftNumeric && rightNumeric) {
      const order = compareNumbers(stripZeros(left), stripZeros(right));
      if (order !== 0) return order;
    } else if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    } else {
      const order = compareText(left.toLowerCase(), right.toLowerCase());
      if (order !== 0) return order;
    }
  }
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}

function compareText(a: string, b: string): Order {
  return a === b ? 0 : a < b ? -1 : 1;
}

/** Total order: -1 when `a` is lower than `b`, 0 when equal, 1 when higher. */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): Order {
  const length = Math.max(a.numbers.length, b.numbers.length);
  for (let i = 0; i < length; i++) {
    const order = compareNumbers(a.numbers[i] ?? '0', b.numbers[i] ?? '0');
    if (order !== 0) return order;
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}
