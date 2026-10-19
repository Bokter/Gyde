import type { AnalysisAccepted, CreateAnalysisJob, VerifyApiKeyResponse } from '@gyde/contracts';

import type {
  AnalysisAcceptedDto,
  ApiKeyVerificationDto,
  CreateAnalysisJobDto,
} from '../../application/dto/gateway.dto';

/**
 * Handed over by reference, as in `http/mappers/gateway.mapper.ts`: the DTOs mirror the contract
 * and the clients have already validated what comes in with the contract's schemas.
 */

export function toApiKeyVerificationDto(contract: VerifyApiKeyResponse): ApiKeyVerificationDto {
  return contract;
}

export function toCreateAnalysisJobContract(dto: CreateAnalysisJobDto): CreateAnalysisJob {
  return dto;
}

export function toAnalysisAcceptedDto(contract: AnalysisAccepted): AnalysisAcceptedDto {
  return contract;
}
