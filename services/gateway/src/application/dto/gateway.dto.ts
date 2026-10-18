import type { Entitlements } from '../../domain/principal';

/**
 * Plain input/output types of the use cases. They mirror the shapes of the contract package (same
 * literal unions, same fields) so a contract value is assignable to them and back without casts:
 * `test/dto-contract.test.ts` fails to compile if either side drifts. They validate nothing; the
 * runtime validation stays at the edge (Zod schemas of the contract).
 */

/** What Web answers about a key: the use case only needs the caller, never the reason. */
export type ApiKeyVerificationDto =
  | {
      valid: true;
      tenantId: string;
      apiKeyId: string;
      entitlements: Entitlements;
    }
  | {
      valid: false;
      reason: 'unknown' | 'revoked' | 'expired' | 'suspended';
    };

export type DependencyDto = {
  ecosystem: 'nuget' | 'upm' | 'unreal' | 'cpp';
  name: string;
  version: string;
  declaredLicense?: string | undefined;
  direct: boolean;
};

export type AnalysisRequestDto = {
  client: { kind: 'cli' | 'github-action' | 'vscode-extension'; version: string };
  project: {
    gameEngine: 'unity' | 'unreal';
    gameEngineVersion: string;
    sdks: { name: string; version: string }[];
    platforms: (
      | 'windows'
      | 'linux'
      | 'macos'
      | 'android'
      | 'ios'
      | 'webgl'
      | 'playstation'
      | 'xbox'
      | 'switch'
    )[];
  };
  dependencies: DependencyDto[];
  options: { includeAi: boolean };
};

/** The message the gateway sends to Reports: the request wrapped with its tenant and plan. */
export type CreateAnalysisJobDto = {
  tenantId: string;
  entitlements: Entitlements;
  request: AnalysisRequestDto;
};

export type AnalysisAcceptedDto = {
  analysisId: string;
  status: 'pending' | 'retrieving' | 'analyzing' | 'ready' | 'failed';
};
