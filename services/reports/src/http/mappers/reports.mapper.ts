import type {
  AiResult,
  AnalysisAccepted,
  AnalysisFailure,
  CreateAnalysisJob,
  DeterministicResult,
  Report,
} from '@gyde/contracts';

import type {
  AiResultDto,
  AnalysisAcceptedDto,
  AnalysisFailureDto,
  CreateAnalysisDto,
  DeterministicResultDto,
  GetReportDto,
  ReportDto,
} from '../../application/dto/analysis.dto';

/*
 * Contract <-> DTO. The DTOs are structural twins of the contract messages (a test pins that a
 * contract value is assignable both ways), so nested structures such as the request, the findings
 * or the entitlements cross as they are; only the envelope is rebuilt here.
 */

export function toCreateAnalysisDto(job: CreateAnalysisJob): CreateAnalysisDto {
  return { tenantId: job.tenantId, entitlements: job.entitlements, request: job.request };
}

/**
 * The `:analysisId` path parameter is the authoritative id: it overwrites what the body carries,
 * so the use case never has to trust the body alone.
 */
export function toDeterministicResultDto(
  analysisId: string,
  body: DeterministicResult,
): DeterministicResultDto {
  return { ...body, analysisId };
}

export function toAiResultDto(analysisId: string, body: AiResult): AiResultDto {
  return { ...body, analysisId };
}

export function toAnalysisFailureDto(
  analysisId: string,
  body: AnalysisFailure,
): AnalysisFailureDto {
  return { ...body, analysisId };
}

export function toGetReportDto(analysisId: string, tenantId: string | undefined): GetReportDto {
  return { analysisId, tenantId };
}

export function toAcceptedContract(dto: AnalysisAcceptedDto): AnalysisAccepted {
  return { analysisId: dto.analysisId, status: dto.status };
}

/** Optional keys are present only when they have a value, in the order the report has always had. */
export function toReportContract(dto: ReportDto): Report {
  return {
    id: dto.id,
    status: dto.status,
    createdAt: dto.createdAt,
    ...(dto.completedAt !== undefined ? { completedAt: dto.completedAt } : {}),
    degraded: dto.degraded,
    ...(dto.degradedReason !== undefined ? { degradedReason: dto.degradedReason } : {}),
    appliedLayers: dto.appliedLayers,
    summary: {
      counts: {
        critical: dto.summary.counts.critical,
        high: dto.summary.counts.high,
        medium: dto.summary.counts.medium,
        low: dto.summary.counts.low,
        info: dto.summary.counts.info,
      },
      ...(dto.summary.riskScore !== undefined ? { riskScore: dto.summary.riskScore } : {}),
    },
    findings: dto.findings,
    ...(dto.error !== undefined
      ? { error: { code: dto.error.code, message: dto.error.message } }
      : {}),
  };
}
