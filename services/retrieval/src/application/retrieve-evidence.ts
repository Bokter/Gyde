import type { RetrieveRequest } from '@gyde/contracts';

import type { BaseAnalyzer } from '../domain/analyzers/base-analyzer';

import type { LlmClient, ReportsClient } from './ports/downstream';
import type { KnowledgeSource } from './ports/knowledge-source';

export interface RetrieveEvidenceDeps {
  knowledge: KnowledgeSource;
  reports: ReportsClient;
  llm: LlmClient;
  /** The analyzers enabled for this deployment; each one is gated by the plan's entitlements. */
  analyzers: readonly BaseAnalyzer<unknown, unknown>[];
}

/**
 * Use case: Reports asks Retrieval for the evidence of one analysis.
 *
 *  1. Ask the normalization service for the knowledge about the requested packages.
 *  2. Run the analyzers the plan allows (licenses, compatibility, vulnerabilities).
 *  3. Publish the DETERMINISTIC result to Reports. From this moment the report can be delivered,
 *     whatever happens with the AI.
 *  4. If the plan allows AI and the client asked for it, dispatch the evidence to llm-analysis.
 *  5. If step 1 or 2 fails, publish an AnalysisFailure (`retrieval-error`) instead of hanging.
 *
 * TODO(area-3): implement.
 */
export class RetrieveEvidence {
  private readonly deps: RetrieveEvidenceDeps;

  constructor(deps: RetrieveEvidenceDeps) {
    this.deps = deps;
  }

  async execute(_request: RetrieveRequest): Promise<void> {
    void this.deps;
    throw new Error('TODO(area-3): RetrieveEvidence.execute is not implemented yet');
  }
}
