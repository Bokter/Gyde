/**
 * Types of the retrieval domain. They are local on purpose: the domain imports nothing, not even
 * the shared contracts. The edges (`http/mappers`, `infrastructure/mappers`) translate to and from
 * the contracts.
 */
export type Ecosystem = 'nuget' | 'upm' | 'unreal' | 'cpp';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** Severities from the most to the least severe. */
export const SEVERITY_ORDER: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export type Trust = 'high' | 'medium' | 'low';

export interface Dependency {
  ecosystem: Ecosystem;
  name: string;
  /** Resolved version when known, otherwise the declared range. */
  version: string;
  /** License as declared by the package (SPDX identifier when available). */
  declaredLicense?: string | undefined;
  /** False for transitive dependencies. */
  direct: boolean;
}

/** Version range affected by a vulnerability, modeled after the OSV schema. */
export interface AffectedRange {
  ecosystem: Ecosystem;
  name: string;
  /** First affected version (inclusive). */
  introduced?: string | undefined;
  /** First fixed version (exclusive upper bound). */
  fixed?: string | undefined;
  /** Last affected version (inclusive) when there is no fix. */
  lastAffected?: string | undefined;
  /** Explicit list of affected versions, when the source gives one. */
  versions?: string[] | undefined;
}

/** What the analyzers read from a piece of normalized knowledge. */
export interface KnowledgeEntry {
  /** Stable id: "<source>:<id in the source>". */
  id: string;
  kind: string;
  source: string;
  sourceKind: string;
  trust: Trust;
  title: string;
  summary: string;
  aliases: string[];
  severity?: Severity | undefined;
  cvss?: number | undefined;
  affected: AffectedRange[];
  url?: string | undefined;
}

/** A piece of knowledge that supports a finding. */
export interface Evidence {
  source: string;
  trust: Trust;
  summary: string;
  url?: string | undefined;
  /** Id of the `KnowledgeEntry` this evidence comes from. */
  knowledgeId?: string | undefined;
}

export type FindingKind = 'vulnerability' | 'license' | 'compatibility' | 'outdated';

/** A prioritized, explainable risk: evidence + impact + recommendation. */
export interface Finding {
  id: string;
  kind: FindingKind;
  severity: Severity;
  title: string;
  dependency?: { ecosystem: Ecosystem; name: string; version: string } | undefined;
  evidence: Evidence[];
  impact?: string | undefined;
  recommendation?: string | undefined;
  cvss?: number | undefined;
  references: string[];
  /** True when produced by deterministic matching, without any LLM involved. */
  deterministic: boolean;
}
