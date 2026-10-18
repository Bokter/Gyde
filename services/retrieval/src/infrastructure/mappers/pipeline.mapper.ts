import type {
  AnalysisFailure,
  DeterministicResult,
  Evidence as EvidenceContract,
  Finding as FindingContract,
  LlmAnalysisRequest,
  Platform,
} from '@gyde/contracts';

import type {
  AnalysisFailureDto,
  DeterministicResultDto,
  LlmAnalysisRequestDto,
} from '../../application/dto/retrieval.dto';
import type { Evidence, Finding } from '../../domain/types';

export function toEvidenceContract(evidence: Evidence): EvidenceContract {
  return {
    source: evidence.source,
    trust: evidence.trust,
    summary: evidence.summary,
    ...(evidence.url !== undefined && { url: evidence.url }),
    ...(evidence.knowledgeId !== undefined && { knowledgeId: evidence.knowledgeId }),
  };
}

export function toFindingContract(finding: Finding): FindingContract {
  return {
    id: finding.id,
    kind: finding.kind,
    severity: finding.severity,
    title: finding.title,
    ...(finding.dependency && {
      dependency: {
        ecosystem: finding.dependency.ecosystem,
        name: finding.dependency.name,
        version: finding.dependency.version,
      },
    }),
    evidence: finding.evidence.map(toEvidenceContract),
    ...(finding.impact !== undefined && { impact: finding.impact }),
    ...(finding.recommendation !== undefined && { recommendation: finding.recommendation }),
    ...(finding.cvss !== undefined && { cvss: finding.cvss }),
    references: [...finding.references],
    deterministic: finding.deterministic,
  };
}

export function toDeterministicResultContract(dto: DeterministicResultDto): DeterministicResult {
  return {
    analysisId: dto.analysisId,
    findings: dto.findings.map(toFindingContract),
    evidence: dto.evidence.map(toEvidenceContract),
    coverage: {
      vulnerabilities: dto.coverage.vulnerabilities,
      compatibility: dto.coverage.compatibility,
      licenses: dto.coverage.licenses,
    },
    partialSources: dto.partialSources,
  };
}

export function toLlmAnalysisRequestContract(dto: LlmAnalysisRequestDto): LlmAnalysisRequest {
  return {
    analysisId: dto.analysisId,
    tenantId: dto.tenantId,
    project: {
      gameEngine: dto.project.gameEngine,
      gameEngineVersion: dto.project.gameEngineVersion,
      sdks: dto.project.sdks.map(({ name, version }) => ({ name, version })),
      // The platforms came from the contract unchanged (`toRetrieveEvidenceDto`) and go back as is.
      platforms: dto.project.platforms as Platform[],
    },
    findings: dto.findings.map(toFindingContract),
    evidence: dto.evidence.map(toEvidenceContract),
  };
}

export function toAnalysisFailureContract(dto: AnalysisFailureDto): AnalysisFailure {
  return {
    analysisId: dto.analysisId,
    stage: dto.stage,
    reason: dto.reason,
    message: dto.message,
  };
}
