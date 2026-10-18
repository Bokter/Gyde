/**
 * The common shape every source is normalized into. Plain, immutable values: the rules that
 * produce them live in the normalizers, and the contract (`@gyde/contracts`) is mapped at the
 * edges. The unions are local copies of the contract's, so the contract stays assignable.
 */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Trust = 'high' | 'medium' | 'low';
export type SourceKind = 'structured' | 'official' | 'community';
export type KnowledgeKind = 'vulnerability' | 'changelog' | 'documentation' | 'issue' | 'license';
export type Ecosystem = 'nuget' | 'upm' | 'unreal' | 'cpp';
export type GameEngine = 'unity' | 'unreal';

/** Version range affected by a vulnerability, modeled after the OSV schema. */
export type AffectedRange = {
  readonly ecosystem: Ecosystem;
  readonly name: string;
  /** First affected version (inclusive). */
  readonly introduced?: string;
  /** First fixed version (exclusive upper bound). */
  readonly fixed?: string;
  /** Last affected version (inclusive) when there is no fix. */
  readonly lastAffected?: string;
  /** Explicit list of affected versions, when the source gives one. */
  readonly versions?: readonly string[];
};

export type KnowledgeObject = {
  /** Stable id: "<source>:<id in the source>", e.g. "osv:GHSA-xxxx". */
  readonly id: string;
  readonly kind: KnowledgeKind;
  readonly source: string;
  readonly sourceKind: SourceKind;
  readonly trust: Trust;
  readonly title: string;
  readonly summary: string;
  readonly aliases: readonly string[];
  readonly severity?: Severity;
  readonly cvss?: number;
  readonly affected: readonly AffectedRange[];
  readonly gameEngines: readonly GameEngine[];
  readonly url?: string;
  readonly publishedAt?: string;
  readonly modifiedAt?: string;
  readonly ingestedAt: string;
};
