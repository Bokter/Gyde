import type { RetrieveRequest } from '@gyde/contracts';

import type { RetrieveEvidenceDto } from '../../application/dto/retrieval.dto';

/** Wire contract -> DTO. Keeps only what the use case needs from the plan and the request. */
export function toRetrieveEvidenceDto(request: RetrieveRequest): RetrieveEvidenceDto {
  const { analysisId, tenantId, entitlements, request: analysis } = request;
  const { project } = analysis;
  return {
    analysisId,
    tenantId,
    features: {
      licenseCompliance: entitlements.features.licenseCompliance,
      compatibilityAnalysis: entitlements.features.compatibilityAnalysis,
      aiEnrichment: entitlements.features.aiEnrichment,
    },
    project: {
      gameEngine: project.gameEngine,
      gameEngineVersion: project.gameEngineVersion,
      sdks: project.sdks.map(({ name, version }) => ({ name, version })),
      platforms: [...project.platforms],
    },
    dependencies: analysis.dependencies.map((dependency) => ({
      ecosystem: dependency.ecosystem,
      name: dependency.name,
      version: dependency.version,
      ...(dependency.declaredLicense !== undefined && {
        declaredLicense: dependency.declaredLicense,
      }),
      direct: dependency.direct,
    })),
    includeAi: analysis.options.includeAi,
  };
}
