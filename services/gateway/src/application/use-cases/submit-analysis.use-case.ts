import type { ReportsClient } from '../ports/reports-client';
import type { UsageCounter } from '../ports/usage-counter';
import type {
  AnalysisAcceptedDto,
  AnalysisRequestDto,
  CreateAnalysisJobDto,
} from '../dto/gateway.dto';
import type { Principal } from '../../domain/principal';
import { PlanLimitExceededError } from '../errors';
import { billingPeriodOf } from '../../domain/usage-allowance';
import type { RequestContext } from '../request-context';

export interface SubmitAnalysisDeps {
  reports: ReportsClient;
  usage: UsageCounter;
  /** Epoch milliseconds; injected so a test can move across months. */
  now: () => number;
}

/**
 * `POST /v1/analyses`: checks the plan's monthly allowance, wraps the request with the tenant and
 * its entitlements and hands it to Reports.
 *
 * The allowance is taken before calling Reports, so simultaneous requests cannot overshoot it, and
 * given back if Reports does not accept the analysis: an outage must not cost the customer one.
 */
export class SubmitAnalysisUseCase {
  constructor(private readonly deps: SubmitAnalysisDeps) {}

  async execute(
    principal: Principal,
    request: AnalysisRequestDto,
    context: RequestContext,
  ): Promise<AnalysisAcceptedDto> {
    const { plan, limits } = principal.entitlements;
    const period = billingPeriodOf(this.deps.now());

    if (!this.deps.usage.reserve(principal.tenantId, period, limits.analysesPerMonth)) {
      throw new PlanLimitExceededError(plan, limits.analysesPerMonth);
    }

    const job: CreateAnalysisJobDto = {
      tenantId: principal.tenantId,
      entitlements: principal.entitlements,
      request,
    };
    try {
      return await this.deps.reports.createAnalysis(job, {
        ...context,
        tenantId: principal.tenantId,
      });
    } catch (error) {
      this.deps.usage.release(principal.tenantId, period);
      throw error;
    }
  }
}
