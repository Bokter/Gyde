/**
 * Domain copy of the report vocabulary. The literal unions are the same as the contract's, so a
 * contract value is assignable here (and back) without casts; a test pins that equivalence.
 */

export type Ecosystem = 'nuget' | 'upm' | 'unreal' | 'cpp';

export type Trust = 'high' | 'medium' | 'low';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type FindingKind = 'vulnerability' | 'license' | 'compatibility' | 'outdated';

export interface Evidence {
  source: string;
  trust: Trust;
  summary: string;
  url?: string;
  knowledgeId?: string;
}

export interface AffectedDependency {
  ecosystem: Ecosystem;
  name: string;
  version: string;
}

/** A prioritized, explainable risk: evidence + impact + recommendation. */
export interface Finding {
  id: string;
  kind: FindingKind;
  severity: Severity;
  title: string;
  dependency?: AffectedDependency;
  evidence: Evidence[];
  impact?: string;
  recommendation?: string;
  cvss?: number;
  references: string[];
  deterministic: boolean;
  aiExplanation?: string;
}

/** Why a report is degraded: the AI layer was expected and could not run. */
export type DegradedReason = 'llm-unavailable' | 'llm-not-configured' | 'llm-error';

/** Decorator layers applied on top of the basic report. */
export type ReportLayer = 'basic' | 'severity-score' | 'license-compliance' | 'ai-enrichment';

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface ReportSummary {
  counts: SeverityCounts;
  /** 0-100, only when the severity-score layer ran. */
  riskScore?: number;
}

/** What `renderMarkdown` reads of a report: a contract `Report` and a `ReportView` both fit. */
export interface RenderableReport {
  id: string;
  status: string;
  createdAt: string;
  completedAt?: string;
  degraded: boolean;
  degradedReason?: DegradedReason;
  appliedLayers: ReportLayer[];
  summary: ReportSummary;
  findings: Finding[];
}

/** The report derived from an analysis (what the contract's `Report` carries). */
export interface ReportView extends RenderableReport {
  status: 'pending' | 'retrieving' | 'analyzing' | 'ready' | 'failed';
  error?: { code: 'internal'; message: string };
}
