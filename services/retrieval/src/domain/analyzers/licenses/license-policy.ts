import type { Severity } from '../../model';

/**
 * The compatibility table, kept as DATA: what each license means for a game that is distributed
 * as a proprietary product. Review it with legal before changing it; the analyzer only reads it.
 *
 * Ids are lower-cased SPDX identifiers (deprecated ones such as "gpl-3.0" included).
 */
export type LicenseClass = 'permissive' | 'weak-copyleft' | 'strong-copyleft' | 'network-copyleft';

export const LICENSE_CLASSES: Readonly<Record<string, LicenseClass>> = {
  // Permissive: no obligation that affects proprietary distribution beyond attribution.
  mit: 'permissive',
  'mit-0': 'permissive',
  'apache-2.0': 'permissive',
  'bsd-2-clause': 'permissive',
  'bsd-3-clause': 'permissive',
  'bsd-3-clause-clear': 'permissive',
  '0bsd': 'permissive',
  isc: 'permissive',
  zlib: 'permissive',
  unlicense: 'permissive',
  'cc0-1.0': 'permissive',
  'bsl-1.0': 'permissive',
  'ms-pl': 'permissive',
  'python-2.0': 'permissive',
  'libpng-2.0': 'permissive',
  x11: 'permissive',
  curl: 'permissive',
  openssl: 'permissive',

  // Weak copyleft: changes to the library itself must be shared; linking rules apply.
  'lgpl-2.0-only': 'weak-copyleft',
  'lgpl-2.0-or-later': 'weak-copyleft',
  'lgpl-2.1': 'weak-copyleft',
  'lgpl-2.1-only': 'weak-copyleft',
  'lgpl-2.1-or-later': 'weak-copyleft',
  'lgpl-3.0': 'weak-copyleft',
  'lgpl-3.0-only': 'weak-copyleft',
  'lgpl-3.0-or-later': 'weak-copyleft',
  'mpl-2.0': 'weak-copyleft',
  'epl-1.0': 'weak-copyleft',
  'epl-2.0': 'weak-copyleft',
  'cddl-1.0': 'weak-copyleft',
  'cddl-1.1': 'weak-copyleft',
  'ms-rl': 'weak-copyleft',

  // Strong copyleft: the whole combined work must be offered under the same license.
  'gpl-2.0': 'strong-copyleft',
  'gpl-2.0-only': 'strong-copyleft',
  'gpl-2.0-or-later': 'strong-copyleft',
  'gpl-3.0': 'strong-copyleft',
  'gpl-3.0-only': 'strong-copyleft',
  'gpl-3.0-or-later': 'strong-copyleft',
  'eupl-1.1': 'strong-copyleft',
  'eupl-1.2': 'strong-copyleft',
  'osl-3.0': 'strong-copyleft',
  'cc-by-sa-4.0': 'strong-copyleft',

  // Network copyleft: also triggered by offering the software over a network (game servers).
  'agpl-3.0': 'network-copyleft',
  'agpl-3.0-only': 'network-copyleft',
  'agpl-3.0-or-later': 'network-copyleft',
  'sspl-1.0': 'network-copyleft',
};

/** Exceptions that let a copyleft library be linked into a work under another license. */
export const LINKING_EXCEPTIONS: ReadonlySet<string> = new Set([
  'classpath-exception-2.0',
  'gcc-exception-2.0',
  'gcc-exception-3.1',
  'llvm-exception',
  'lgpl-3.0-linking-exception',
  'openssl-exception',
]);

/** Pairs that cannot be satisfied at once when combined with AND in a single expression. */
export const INCOMPATIBLE_PAIRS: readonly (readonly [string, string])[] = [
  ['gpl-2.0-only', 'apache-2.0'],
  ['gpl-2.0-only', 'gpl-3.0-only'],
  ['gpl-2.0-only', 'lgpl-3.0-only'],
  ['gpl-2.0-only', 'agpl-3.0-only'],
];

/** How serious each class is for proprietary distribution. Permissive raises no finding. */
export const CLASS_SEVERITY: Readonly<Record<LicenseClass, Severity | undefined>> = {
  permissive: undefined,
  'weak-copyleft': 'low',
  'strong-copyleft': 'medium',
  'network-copyleft': 'high',
};

/** Order of concern, to choose between the alternatives (OR) and the obligations (AND). */
export const CLASS_RANK: Readonly<Record<LicenseClass | 'unknown', number>> = {
  permissive: 0,
  unknown: 1,
  'weak-copyleft': 2,
  'strong-copyleft': 3,
  'network-copyleft': 4,
};
