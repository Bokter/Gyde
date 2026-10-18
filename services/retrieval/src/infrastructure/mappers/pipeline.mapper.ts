import type {
  AnalysisFailure,
  DeterministicResult,
  Evidence as EvidenceContract,
  Finding as FindingContract,
  LlmAnalysisRequest,
} from '@gyde/contracts';

import type {
  AnalysisFailureDto,
  DeterministicResultDto,
  LlmAnalysisRequestDto,
  ProjectDto,
} from '../../application/dto/retrieval.dto';
import type { Evidence, Finding } from '../../domain/model';

// Spreads keep the key order of the objects and never add a key, so the bodies sent downstream
// are the same as before the refactor.

const toEvidenceContract = (evidence: Evidence): EvidenceContract => ({ ...evidence });

export function toFindingContract(finding: Finding): FindingContract {
  return {
    ...finding,
    ...(finding.dependency && { dependency: { ...finding.dependency } }),
    evidence: finding.evidence.map(toEvidenceContract),
    references: [...finding.references],
  };
}

const toProjectContract = (project: ProjectDto): LlmAnalysisRequest['project'] => ({
  ...project,
  sdks: project.sdks.map((sdk) => ({ ...sdk })),
  platforms: [...project.platforms],
});

export function toDeterministicResultContract(result: DeterministicResultDto): DeterministicResult {
  return {
    analysisId: result.analysisId,
    findings: result.findings.map(toFindingContract),
    evidence: result.evidence.map(toEvidenceContract),
    coverage: { ...result.coverage },
    partialSources: result.partialSources,
  };
}

export function toLlmAnalysisRequestContract(request: LlmAnalysisRequestDto): LlmAnalysisRequest {
  return {
    analysisId: request.analysisId,
    tenantId: request.tenantId,
    project: toProjectContract(request.project),
    findings: request.findings.map(toFindingContract),
    evidence: request.evidence.map(toEvidenceContract),
  };
}

export function toAnalysisFailureContract(failure: AnalysisFailureDto): AnalysisFailure {
  return {
    analysisId: failure.analysisId,
    stage: failure.stage,
    reason: failure.reason,
    message: failure.message,
  };
}
