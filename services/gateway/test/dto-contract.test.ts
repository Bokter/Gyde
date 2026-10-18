import type {
  AnalysisAccepted,
  AnalysisRequest,
  CreateAnalysisJob,
  VerifyApiKeyResponse,
} from '@gyde/contracts';
import { describe, expect, it } from 'vitest';

import type {
  AnalysisAcceptedDto,
  AnalysisRequestDto,
  ApiKeyVerificationDto,
  CreateAnalysisJobDto,
} from '../src/application/dto/gateway.dto';
import type { Entitlements as DomainEntitlements } from '../src/domain/principal';
import type { Entitlements } from '@gyde/contracts';

/** `true` when each type is assignable to the other; `never` (a compile error) otherwise. */
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/**
 * The DTOs mirror the contract so the mappers can hand values over by reference. These constants
 * are checked by `pnpm typecheck`: if the contract gains, loses or changes a field, they stop
 * compiling and the DTO must follow.
 */
const analysisRequest: Mutual<AnalysisRequest, AnalysisRequestDto> = true;
const analysisAccepted: Mutual<AnalysisAccepted, AnalysisAcceptedDto> = true;
const createAnalysisJob: Mutual<CreateAnalysisJob, CreateAnalysisJobDto> = true;
const verification: Mutual<VerifyApiKeyResponse, ApiKeyVerificationDto> = true;
const entitlements: Mutual<Entitlements, DomainEntitlements> = true;

describe('DTOs and domain types versus the contract', () => {
  it('are assignable both ways (the real check is at compile time)', () => {
    expect([
      analysisRequest,
      analysisAccepted,
      createAnalysisJob,
      verification,
      entitlements,
    ]).toEqual([true, true, true, true, true]);
  });
});
