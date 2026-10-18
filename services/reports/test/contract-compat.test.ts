import type {
  AiResult as ContractAiResult,
  AnalysisAccepted as ContractAnalysisAccepted,
  AnalysisFailure as ContractAnalysisFailure,
  DeterministicResult as ContractDeterministicResult,
  Entitlements as ContractEntitlements,
  CreateAnalysisJob as ContractCreateAnalysisJob,
  Finding as ContractFinding,
  Report as ContractReport,
  RetrieveRequest as ContractRetrieveRequest,
  ReportStatus as ContractReportStatus,
} from '@gyde/contracts';
import { describe, expect, it } from 'vitest';

import type {
  AnalysisAcceptedDto,
  CreateAnalysisDto,
  RetrieveRequestDto,
} from '../src/application/dto/analysis.dto';
import type {
  AiResult,
  AnalysisFailure,
  AnalysisStatus,
  DeterministicResult,
  Entitlements,
} from '../src/domain/entities/analysis-types';
import type { Finding, ReportView } from '../src/domain/report/report-types';

/** Compiles only when A and B are assignable to each other (checked by `pnpm typecheck`). */
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
function assertAssignableBothWays<_Check extends true>(): void {}

describe('domain types stay equivalent to the contract (no casts at the borders)', () => {
  it('the pipeline messages and the finding vocabulary', () => {
    assertAssignableBothWays<Mutual<ContractFinding, Finding>>();
    assertAssignableBothWays<Mutual<ContractEntitlements, Entitlements>>();
    assertAssignableBothWays<Mutual<ContractDeterministicResult, DeterministicResult>>();
    assertAssignableBothWays<Mutual<ContractAiResult, AiResult>>();
    assertAssignableBothWays<Mutual<ContractAnalysisFailure, AnalysisFailure>>();
    assertAssignableBothWays<Mutual<ContractReportStatus, AnalysisStatus>>();
    expect(true).toBe(true);
  });

  it('the DTOs of the use cases', () => {
    assertAssignableBothWays<Mutual<ContractCreateAnalysisJob, CreateAnalysisDto>>();
    assertAssignableBothWays<Mutual<ContractRetrieveRequest, RetrieveRequestDto>>();
    assertAssignableBothWays<Mutual<ContractAnalysisAccepted, AnalysisAcceptedDto>>();
    expect(true).toBe(true);
  });

  it('the report: the domain view fits the contract and the contract fits what is rendered', () => {
    const view = (r: ReportView): ContractReport => r;
    expect(view).toBeTypeOf('function');
  });
});
