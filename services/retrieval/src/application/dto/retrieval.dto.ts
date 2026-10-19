import type { Dependency, Evidence, Finding, KnowledgeEntry } from '../../domain/model';

/**
 * Plain input/output types of the use case. They hold only what Retrieval needs: the mappers of
 * `http/` and `infrastructure/` translate them to and from the shared contract schemas.
 */

export type GameEngine = 'unity' | 'unreal';

export type Platform =
  'windows' | 'linux' | 'macos' | 'android' | 'ios' | 'webgl' | 'playstation' | 'xbox' | 'switch';

export type ProjectDto = {
  readonly gameEngine: GameEngine;
  readonly gameEngineVersion: string;
  readonly sdks: readonly { readonly name: string; readonly version: string }[];
  readonly platforms: readonly Platform[];
};

/** The plan features Retrieval reads (the rest of the entitlements is not its business). */
export type PlanFeaturesDto = {
  readonly licenseCompliance: boolean;
  readonly compatibilityAnalysis: boolean;
  readonly aiEnrichment: boolean;
};

/** Input of `RetrieveEvidenceUseCase`: Reports asks for the evidence of one analysis. */
export type RetrieveEvidenceDto = {
  readonly analysisId: string;
  readonly tenantId: string;
  readonly features: PlanFeaturesDto;
  readonly dependencies: readonly Dependency[];
  readonly project: ProjectDto;
  /** The client asked for the AI layer (still subject to the plan). */
  readonly includeAi: boolean;
};

/** What Retrieval publishes to Reports: the deterministic part of the analysis. */
export type DeterministicResultDto = {
  readonly analysisId: string;
  readonly findings: readonly Finding[];
  readonly evidence: readonly Evidence[];
  readonly coverage: {
    readonly vulnerabilities: boolean;
    readonly compatibility: boolean;
    readonly licenses: boolean;
  };
  readonly partialSources: boolean;
};

/** What Retrieval hands to llm-analysis. */
export type LlmAnalysisRequestDto = {
  readonly analysisId: string;
  readonly tenantId: string;
  readonly project: ProjectDto;
  readonly findings: readonly Finding[];
  readonly evidence: readonly Evidence[];
};

/** A stage that could not complete, published to Reports. */
export type AnalysisFailureDto = {
  readonly analysisId: string;
  readonly stage: 'retrieval' | 'llm';
  readonly reason: 'retrieval-error' | 'llm-unavailable' | 'llm-not-configured' | 'llm-error';
  readonly message: string;
};

/** The question asked to the knowledge source. */
export type KnowledgeQueryDto = {
  readonly packages: readonly {
    readonly ecosystem: Dependency['ecosystem'];
    readonly name: string;
    readonly version: string;
  }[];
  readonly gameEngine: GameEngine;
  readonly limit: number;
};

export type KnowledgeAnswerDto = {
  readonly entries: readonly KnowledgeEntry[];
  /**
   * True when the answer is not fresh and complete: it was served from the last cached response
   * because normalization could not be reached.
   */
  readonly partial: boolean;
};
