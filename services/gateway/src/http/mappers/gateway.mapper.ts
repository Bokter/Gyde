import type { AnalysisAccepted, AnalysisRequest, AuthVerifyResponse } from '@gyde/contracts';

import type { AnalysisAcceptedDto, AnalysisRequestDto } from '../../application/dto/gateway.dto';
import type { Principal } from '../../domain/principal';

/**
 * The mappers below hand the value over by reference on purpose: the DTOs mirror the contract
 * (checked at compile time by `test/dto-contract.test.ts`), and copying field by field would drop,
 * unnoticed, any field the contract gains later.
 */

/** The entitlements are the ones Web returned for the key: they are not recomputed. */
export function toAuthVerifyResponse(principal: Principal): AuthVerifyResponse {
  return { plan: principal.entitlements.plan, entitlements: principal.entitlements };
}

export function toAnalysisRequestDto(contract: AnalysisRequest): AnalysisRequestDto {
  return contract;
}

export function toAnalysisAcceptedContract(dto: AnalysisAcceptedDto): AnalysisAccepted {
  return dto;
}
