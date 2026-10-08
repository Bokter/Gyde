import type {
  AnalysisAccepted,
  AnalysisRequest,
  AuthVerifyResponse,
  Dependency,
  ProjectContext,
  Report,
} from '@gyde/contracts';

/** What the local parsers extract from a game project. Only names, versions and licenses. */
export interface ParsedProject {
  project: ProjectContext;
  dependencies: Dependency[];
}

/** A remote analysis that was accepted by the backend. */
export interface AnalysisJob {
  analysisId: string;
}

/**
 * Port to the Gyde backend (through the API gateway). `GydeApiClient` is the real adapter; tests
 * and the pipelines depend only on this interface.
 */
export interface AnalysisGateway {
  /** GET /v1/auth/verify: validates the API key and returns the plan. */
  verifyKey(): Promise<AuthVerifyResponse>;
  /** POST /v1/analyses */
  submitAnalysis(request: AnalysisRequest): Promise<AnalysisAccepted>;
  /** GET /v1/analyses/:analysisId */
  getReport(analysisId: string): Promise<Report>;
}
