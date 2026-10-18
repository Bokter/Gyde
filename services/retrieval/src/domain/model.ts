/**
 * Domain types of Retrieval. They are plain, read-only value objects with their own names: the
 * domain does not import `@gyde/contracts`. The unions are the same literals as the contract's, so
 * a contract object is assignable to these types without casts (and the mappers of the outer
 * layers do the conversion in the other direction).
 */

export type Ecosystem = 'nuget' | 'upm' | 'unreal' | 'cpp';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** Severities from the most to the least severe (local copy of the contract's order). */
export const SEVERITY_ORDER: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export type Trust = 'high' | 'medium' | 'low';

export interface Dependency {
  readonly ecosystem: Ecosystem;
  readonly name: string;
  /** Resolved version when known, otherwise the declared range. */
  readonly version: string;
  /** License as declared by the package (SPDX identifier when available). */
  readonly declaredLicense?: string | undefined;
  readonly direct: boolean;
}

/** Version range affected by a vulnerability (OSV style). */
export interface AffectedRange {
  readonly ecosystem: Ecosystem;
  readonly name: string;
  readonly introduced?: string | undefined;
  readonly fixed?: string | undefined;
  readonly lastAffected?: string | undefined;
  readonly versions?: readonly string[] | undefined;
}

/** What an analyzer reads from a piece of normalized knowledge. */
export interface KnowledgeEntry {
  readonly id: string;
  readonly kind: 'vulnerability' | 'changelog' | 'documentation' | 'issue' | 'license';
  readonly source: string;
  readonly sourceKind: 'structured' | 'official' | 'community';
  readonly trust: Trust;
  readonly title: string;
  readonly summary: string;
  readonly aliases: readonly string[];
  readonly severity?: Severity | undefined;
  readonly cvss?: number | undefined;
  readonly affected: readonly AffectedRange[];
  readonly url?: string | undefined;
}

export interface Evidence {
  readonly source: string;
  readonly trust: Trust;
  readonly summary: string;
  readonly url?: string | undefined;
  /** Id of the knowledge entry this evidence comes from. */
  readonly knowledgeId?: string | undefined;
}

export interface Finding {
  readonly id: string;
  readonly kind: 'vulnerability' | 'license' | 'compatibility' | 'outdated';
  readonly severity: Severity;
  readonly title: string;
  readonly dependency?: Pick<Dependency, 'ecosystem' | 'name' | 'version'> | undefined;
  readonly evidence: Evidence[];
  readonly impact?: string | undefined;
  readonly recommendation?: string | undefined;
  readonly cvss?: number | undefined;
  readonly references: string[];
  /** True when produced by deterministic matching, without any LLM involved. */
  readonly deterministic: boolean;
}
