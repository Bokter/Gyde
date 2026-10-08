import { AnalysisRequest, type AnalysisOptions, type ClientInfo } from '@gyde/contracts';

import type { ParsedProject } from '../types';

/**
 * PRIVACY GATE. The only way to build the request that leaves the customer's environment.
 *
 * Defense in depth: it copies an explicit allow-list of fields (so a parser that attaches a file
 * path or a snippet to a dependency cannot leak it) and then validates the result against the
 * strict schema, which rejects anything unexpected.
 */
export function buildAnalysisRequest(input: {
  parsed: ParsedProject;
  client: ClientInfo;
  options?: Partial<AnalysisOptions>;
}): AnalysisRequest {
  const { parsed, client, options } = input;

  return AnalysisRequest.parse({
    client: { kind: client.kind, version: client.version },
    project: {
      gameEngine: parsed.project.gameEngine,
      gameEngineVersion: parsed.project.gameEngineVersion,
      sdks: parsed.project.sdks.map((sdk) => ({ name: sdk.name, version: sdk.version })),
      platforms: [...parsed.project.platforms],
    },
    dependencies: parsed.dependencies.map((dependency) => ({
      ecosystem: dependency.ecosystem,
      name: dependency.name,
      version: dependency.version,
      direct: dependency.direct,
      ...(dependency.declaredLicense === undefined
        ? {}
        : { declaredLicense: dependency.declaredLicense }),
    })),
    options: { includeAi: options?.includeAi ?? true },
  });
}
