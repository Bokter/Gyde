import type { IdHasher, LicenseExpression, LicenseExpressionParser } from '../../ports';
import type { Dependency, Finding, Severity } from '../../types';
import { BaseAnalyzer, type AnalyzerInput } from '../base-analyzer';
import {
  CLASS_RANK,
  CLASS_SEVERITY,
  INCOMPATIBLE_PAIRS,
  LICENSE_CLASSES,
  LINKING_EXCEPTIONS,
  type LicenseClass,
} from './license-policy';

export interface LicenseMatch {
  dependency: Dependency;
  /** SPDX expression of the dependency, e.g. "GPL-3.0-only" or "MIT OR Apache-2.0". */
  license: string;
  reason: 'copyleft' | 'unknown' | 'incompatible' | 'missing';
  /** Class of the license that decides the outcome (absent for missing / unknown / incompatible). */
  licenseClass?: Exclude<LicenseClass, 'permissive'>;
  /** The license of the expression that decides the outcome, as written. */
  driver?: string;
  /** For reason `unknown`: false when the text is not an SPDX expression at all, true when it is
   * a valid one that Gyde has no policy for. */
  valid?: boolean;
  /** The two licenses that cannot be satisfied together (reason `incompatible`). */
  conflict?: readonly [string, string];
}

/**
 * Licenses: deterministic SPDX compatibility for a game distributed as a proprietary product.
 *
 *  - Expressions are parsed (`AND` / `OR` / `WITH`, `+`, parentheses). `OR` lets the licensee pick,
 *    so the least restrictive alternative counts; `AND` stacks obligations, so the most
 *    restrictive one counts. A linking exception (`WITH Classpath-exception-2.0`) softens a
 *    copyleft license by one step.
 *  - The table of what each license means is DATA (`license-policy.ts`).
 *  - A declared license that cannot be recognized is informational, never silently "fine".
 *    A missing license is informational too, but only for NuGet: UPM manifests do not carry one,
 *    so its absence says nothing.
 *
 * The plan gate (`entitlements.features.licenseCompliance`) is applied by the use case.
 */
export class LicenseAnalyzer extends BaseAnalyzer<Dependency, LicenseMatch> {
  readonly name = 'licenses' as const;

  constructor(
    private readonly parser: LicenseExpressionParser,
    private readonly hasher: IdHasher,
  ) {
    super();
  }

  protected select(input: AnalyzerInput): Dependency[] {
    return [...input.request.dependencies];
  }

  protected match(candidates: Dependency[]): LicenseMatch[] {
    return candidates.flatMap((dependency): LicenseMatch[] => {
      const license = dependency.declaredLicense?.trim();
      if (!license) {
        return dependency.ecosystem === 'nuget'
          ? [{ dependency, license: '', reason: 'missing' }]
          : [];
      }
      const assessment = assess(this.parser, license);
      if (assessment.kind === 'unknown') {
        return [{ dependency, license, reason: 'unknown', valid: assessment.valid }];
      }
      if (assessment.kind === 'incompatible') {
        return [{ dependency, license, reason: 'incompatible', conflict: assessment.conflict }];
      }
      if (assessment.licenseClass === 'permissive') return [];
      return [
        {
          dependency,
          license,
          reason: 'copyleft',
          licenseClass: assessment.licenseClass,
          driver: assessment.driver,
        },
      ];
    });
  }

  protected toFinding(match: LicenseMatch): Finding {
    const { dependency, license } = match;
    const base = {
      id: findingId(this.hasher, dependency),
      kind: 'license' as const,
      dependency: {
        ecosystem: dependency.ecosystem,
        name: dependency.name,
        version: dependency.version,
      },
      references: [],
      deterministic: true,
    };

    switch (match.reason) {
      case 'copyleft':
        return copyleftFinding(base, match);
      case 'incompatible': {
        const [a, b] = match.conflict ?? ['?', '?'];
        return {
          ...base,
          severity: 'high',
          title: `${dependency.name} requires licenses that cannot be satisfied together: ${a} and ${b}`,
          evidence: [
            {
              source: 'spdx',
              trust: 'high',
              summary: `${license}: ${a} and ${b} cannot both be complied with at once.`,
            },
          ],
          impact: 'No distribution of the package can satisfy both licenses.',
          recommendation:
            'Ask the author which license applies, or replace the dependency. Confirm with legal.',
        };
      }
      case 'unknown':
        return {
          ...base,
          severity: 'info',
          title: `${dependency.name} declares a license Gyde cannot classify: ${license}`,
          evidence: [
            {
              source: 'spdx',
              trust: 'high',
              summary: match.valid
                ? `"${license}" is a valid SPDX expression, but Gyde has no policy for it.`
                : `"${license}" is not a valid SPDX license expression.`,
            },
          ],
          recommendation:
            'Check the license of the package by hand and, if you rely on it, ask the author for an SPDX identifier.',
        };
      case 'missing':
        return {
          ...base,
          severity: 'info',
          title: `${dependency.name} does not declare a license`,
          evidence: [
            {
              source: 'spdx',
              trust: 'high',
              summary:
                'The package metadata has no license; without one, no right to use it is granted.',
            },
          ],
          recommendation: 'Find out the license of the package before shipping it.',
        };
    }
  }
}

const COPYLEFT_TEXT: Record<
  Exclude<LicenseClass, 'permissive'>,
  { phrase: string; title: string; impact: string; recommendation: string }
> = {
  'strong-copyleft': {
    phrase: 'a strong copyleft license',
    title: 'review compatibility with proprietary distribution',
    impact:
      'Distributing a game that includes it can require offering the source of the whole combined work under the same license.',
    recommendation:
      'Replace the dependency or confirm with legal that your distribution model allows it.',
  },
  'network-copyleft': {
    phrase: 'a network copyleft license',
    title: 'review compatibility with proprietary distribution and online services',
    impact:
      'Besides distribution, offering a game server or service built with it over a network can require publishing its source.',
    recommendation:
      'Replace the dependency or confirm with legal that your distribution and hosting model allows it.',
  },
  'weak-copyleft': {
    phrase: 'a weak copyleft license',
    title: 'check how it is linked and shipped',
    impact:
      'Changes to the library itself must be shared, and the way it is linked can matter (static builds such as IL2CPP or consoles need more care).',
    recommendation:
      'Keep the library replaceable, ship its license text, and confirm the linking in your builds satisfies it.',
  },
};

function copyleftFinding(
  base: Pick<Finding, 'id' | 'kind' | 'dependency' | 'references' | 'deterministic'>,
  match: LicenseMatch,
): Finding {
  const klass = match.licenseClass!;
  const text = COPYLEFT_TEXT[klass];
  const severity = CLASS_SEVERITY[klass] as Severity;
  return {
    ...base,
    severity,
    title: `${match.dependency.name} is ${match.license}: ${text.title}`,
    evidence: [{ source: 'spdx', trust: 'high', summary: `${match.driver} is ${text.phrase}.` }],
    impact: text.impact,
    recommendation: text.recommendation,
  };
}

type Assessment =
  | { kind: 'known'; licenseClass: LicenseClass; driver: string }
  | { kind: 'unknown'; valid: boolean }
  | { kind: 'incompatible'; conflict: readonly [string, string] };

type Node = LicenseExpression;

interface Evaluated {
  licenseClass: LicenseClass | 'unknown';
  driver: string;
}

/** Downgrades a copyleft license one step when a linking exception applies. */
const SOFTENED: Partial<Record<LicenseClass, LicenseClass>> = {
  'strong-copyleft': 'weak-copyleft',
  'weak-copyleft': 'permissive',
};

function evaluate(node: Node, leaves: string[]): Evaluated {
  if ('conjunction' in node) {
    const left = evaluate(node.left, leaves);
    const right = evaluate(node.right, leaves);
    const rank = (value: Evaluated) => CLASS_RANK[value.licenseClass];
    // OR: the licensee chooses, so the least restrictive wins; AND: obligations add up.
    if (node.conjunction === 'or') return rank(right) < rank(left) ? right : left;
    return rank(right) > rank(left) ? right : left;
  }

  leaves.push(node.license.toLowerCase());
  let licenseClass: LicenseClass | 'unknown' =
    LICENSE_CLASSES[node.license.toLowerCase()] ?? 'unknown';
  if (node.exception && LINKING_EXCEPTIONS.has(node.exception.toLowerCase())) {
    if (licenseClass !== 'unknown') licenseClass = SOFTENED[licenseClass] ?? licenseClass;
  }
  const driver = node.exception ? `${node.license} WITH ${node.exception}` : node.license;
  return { licenseClass, driver: node.plus ? `${driver}+` : driver };
}

function assess(parser: LicenseExpressionParser, expression: string): Assessment {
  let tree: Node;
  try {
    tree = parser.parse(expression);
  } catch {
    return { kind: 'unknown', valid: false };
  }

  const leaves: string[] = [];
  const result = evaluate(tree, leaves);

  // Only an AND stacks obligations, so a conflicting pair matters only there.
  if (hasConjunction(tree, 'and')) {
    const conflict = INCOMPATIBLE_PAIRS.find(([a, b]) => leaves.includes(a) && leaves.includes(b));
    if (conflict) return { kind: 'incompatible', conflict };
  }
  if (result.licenseClass === 'unknown') return { kind: 'unknown', valid: true };
  return { kind: 'known', licenseClass: result.licenseClass, driver: result.driver };
}

function hasConjunction(node: Node, conjunction: 'and' | 'or'): boolean {
  if (!('conjunction' in node)) return false;
  return (
    node.conjunction === conjunction ||
    hasConjunction(node.left, conjunction) ||
    hasConjunction(node.right, conjunction)
  );
}

/** Stable, readable finding id; hashed when it would exceed the contract's 100 characters. */
function findingId(hasher: IdHasher, dependency: Dependency): string {
  const readable = `license:${dependency.ecosystem}:${dependency.name}@${dependency.version}`;
  return readable.length <= 100 ? readable : `license:${hasher.sha256Hex(readable).slice(0, 40)}`;
}
