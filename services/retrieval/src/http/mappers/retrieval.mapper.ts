import type { RetrieveRequest } from '@gyde/contracts';

import type { RetrieveEvidenceDto } from '../../application/dto/retrieval.dto';

/**
 * `RetrieveRequest` (already validated by the Zod pipe) -> input of the use case. Keeps only what
 * Retrieval reads: the three plan features, the dependencies and the project context.
 */
export function toRetrieveEvidenceDto(body: RetrieveRequest): RetrieveEvidenceDto {
  const { analysisId, tenantId, entitlements, request } = body;
  const { licenseCompliance, compatibilityAnalysis, aiEnrichment } = entitlements.features;
  const { project } = request;
  return {
    analysisId,
    tenantId,
    features: { licenseCompliance, compatibilityAnalysis, aiEnrichment },
    dependencies: request.dependencies.map((dependency) => ({ ...dependency })),
    project: {
      ...project,
      sdks: project.sdks.map((sdk) => ({ ...sdk })),
      platforms: [...project.platforms],
    },
    includeAi: request.options.includeAi,
  };
}
