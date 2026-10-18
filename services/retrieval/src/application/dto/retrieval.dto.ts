import type { Dependency, Ecosystem, Evidence, Finding, KnowledgeEntry } from '../../domain/types';

/**
 * Plain types the use case speaks. They are not the wire contracts: `http/mappers` and
 * `infrastructure/mappers` translate between the two, so `application/` never depends on them.
 */
export type GameEngine = 'unity' | 'unreal';

export interface ProjectDto {
  gameEngine: GameEngine;
  gameEngineVersion: string;
  sdks: { name: string; version: string }[];
  platforms: string[];
}

/** The plan features that decide what Retrieval runs (the rest of the entitlements are not its concern). */
export interface FeaturesDto {
  licenseCompliance: boolean;
  compatibilityAnalysis: boolean;
  aiEnrichment: boolean;
}

/** Input of `RetrieveEvidence`. */
export interface RetrieveEvidenceDto {
  analysisId: string;
  tenantId: string;
  features: FeaturesDto;
  project: ProjectDto;
  dependencies: Dependency[];
  /** The client asked for the AI enrichment layer. */
  includeAi: boolean;
}

export interface KnowledgeQueryDto {
  packages: { ecosystem: Ecosystem; name: string; version: string }[];
  gameEngine: GameEngine;
  limit: number;
}

export interface KnowledgeAnswerDto {
  objects: KnowledgeEntry[];
  /**
   * True when the answer is not fresh and complete: it was served from the last cached response
   * because normalization could not be reached.
   */
  partial: boolean;
}

/** What Retrieval hands to Reports: the deterministic part of the analysis. */
export interface DeterministicResultDto {
  analysisId: string;
  findings: Finding[];
  evidence: Evidence[];
  coverage: { vulnerabilities: boolean; compatibility: boolean; licenses: boolean };
  partialSources: boolean;
}

/** What Retrieval hands to llm-analysis. */
export interface LlmAnalysisRequestDto {
  analysisId: string;
  tenantId: string;
  project: ProjectDto;
  findings: Finding[];
  evidence: Evidence[];
}

export interface AnalysisFailureDto {
  analysisId: string;
  stage: 'retrieval' | 'llm';
  reason: 'retrieval-error' | 'llm-unavailable' | 'llm-not-configured' | 'llm-error';
  message: string;
}
