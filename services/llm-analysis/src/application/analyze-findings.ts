import type { LlmAnalysisRequest } from '@gyde/contracts';

import type { FindingAnalyzer } from './ports/finding-analyzer';
import type { ReportsClient } from './ports/reports-client';
import type { TenantLlmConfigProvider } from './ports/tenant-llm-config';

export interface AnalyzeFindingsDeps {
  tenantConfig: TenantLlmConfigProvider;
  analyzer: FindingAnalyzer;
  reports: ReportsClient;
}

/**
 * Use case: interpret and correlate the evidence of one analysis with the project context.
 *
 *  1. Fetch the tenant's LLM config (BYOK). Not configured -> publish AnalysisFailure
 *     `llm-not-configured`; the report stays deterministic and tells the studio what to do.
 *  2. Call the provider behind a Circuit Breaker scoped per TENANT + PROVIDER, so one studio's
 *     invalid key or rate limit never opens the circuit for the others.
 *  3. Validate the model output with the `AiResult` schema and publish it to Reports.
 *  4. Provider down / circuit open -> `llm-unavailable` (serve the last cached classification
 *     if there is one); provider error -> `llm-error`. Never throw into the caller.
 *
 * The API key must never appear in logs, errors or the published messages.
 *
 * TODO(area-4): implement.
 */
export class AnalyzeFindings {
  private readonly deps: AnalyzeFindingsDeps;

  constructor(deps: AnalyzeFindingsDeps) {
    this.deps = deps;
  }

  async execute(_request: LlmAnalysisRequest): Promise<void> {
    void this.deps;
    throw new Error('TODO(area-4): AnalyzeFindings.execute is not implemented yet');
  }
}
