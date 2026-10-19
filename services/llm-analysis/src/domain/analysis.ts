/**
 * Plain types of what llm-analysis reasons about. They are local copies of the shapes the platform
 * exchanges (unions of literals identical to the contract ones, so a contract value is assignable
 * to them without casts); the domain imports nothing, not even `@gyde/contracts`.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Trust = 'high' | 'medium' | 'low';
export type Ecosystem = 'nuget' | 'upm' | 'unreal' | 'cpp';
export type FindingKind = 'vulnerability' | 'license' | 'compatibility' | 'outdated';
export type GameEngine = 'unity' | 'unreal';
export type Platform =
  'windows' | 'linux' | 'macos' | 'android' | 'ios' | 'webgl' | 'playstation' | 'xbox' | 'switch';

export type Evidence = {
  source: string;
  trust: Trust;
  summary: string;
  url?: string | undefined;
  knowledgeId?: string | undefined;
};

export type AffectedDependency = {
  ecosystem: Ecosystem;
  name: string;
  version: string;
};

export type Finding = {
  id: string;
  kind: FindingKind;
  severity: Severity;
  title: string;
  dependency?: AffectedDependency | undefined;
  evidence: Evidence[];
  impact?: string | undefined;
  recommendation?: string | undefined;
  cvss?: number | undefined;
  references: string[];
  /** True when produced by deterministic matching, without any LLM involved. */
  deterministic: boolean;
  /** Plain-language explanation from the LLM; present only when AI enrichment ran. */
  aiExplanation?: string | undefined;
};

export type ProjectContext = {
  gameEngine: GameEngine;
  gameEngineVersion: string;
  sdks: { name: string; version: string }[];
  platforms: Platform[];
};

/** What the model is allowed to see of one analysis. */
export type AnalysisInput = {
  analysisId: string;
  project: ProjectContext;
  findings: Finding[];
  evidence: Evidence[];
};

/** What the model answered, already validated: an explanation per finding, in priority order. */
export type ModelOutput = {
  summary?: string | undefined;
  explanations: { id: string; aiExplanation: string }[];
};

/** The deterministic findings enriched and ordered by the model. */
export type AiAnalysis = {
  analysisId: string;
  findings: Finding[];
  summary?: string | undefined;
};
