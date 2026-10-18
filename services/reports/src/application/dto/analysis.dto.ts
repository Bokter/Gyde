import type {
  AiResult,
  AnalysisFailure,
  AnalysisStatus,
  DeterministicResult,
  Entitlements,
} from '../../domain/entities/analysis-types';
import type { Ecosystem, ReportView } from '../../domain/report/report-types';

/**
 * Plain types for what the use cases take and return. The shapes mirror the contract's but are
 * declared here, so `application/` does not depend on the contracts package; a test pins that a contract
 * value is assignable to each of them (and back) without casts.
 */

export type GameEngine = 'unity' | 'unreal';

export type Platform =
  'windows' | 'linux' | 'macos' | 'android' | 'ios' | 'webgl' | 'playstation' | 'xbox' | 'switch';

export type DependencyDto = {
  ecosystem: Ecosystem;
  name: string;
  version: string;
  declaredLicense?: string;
  direct: boolean;
};

/** What a client sends to be analyzed: Reports forwards it to Retrieval untouched. */
export type AnalysisRequestDto = {
  client: { kind: 'cli' | 'github-action' | 'vscode-extension'; version: string };
  project: {
    gameEngine: GameEngine;
    gameEngineVersion: string;
    sdks: { name: string; version: string }[];
    platforms: Platform[];
  };
  dependencies: DependencyDto[];
  options: { includeAi: boolean };
};

export type CreateAnalysisDto = {
  tenantId: string;
  entitlements: Entitlements;
  request: AnalysisRequestDto;
};

export type AnalysisAcceptedDto = {
  analysisId: string;
  status: AnalysisStatus;
};

export type DeterministicResultDto = DeterministicResult;

export type AiResultDto = AiResult;

export type AnalysisFailureDto = AnalysisFailure;

/** Who asks for which report; a missing tenant never matches. */
export type GetReportDto = {
  analysisId: string;
  tenantId: string | undefined;
};

export type ReportDto = ReportView;

export type SweepResultDto = {
  analyzing: number;
  retrieving: number;
};

/** What Reports asks Retrieval for. */
export type RetrieveRequestDto = {
  analysisId: string;
  tenantId: string;
  entitlements: Entitlements;
  request: AnalysisRequestDto;
};
