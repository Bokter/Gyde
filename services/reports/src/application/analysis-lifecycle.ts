import type {
  AiResult,
  AnalysisAccepted,
  AnalysisFailure,
  CreateAnalysisJob,
  DeterministicResult,
  Report,
} from '@gyde/contracts';

import type { ReportRepository } from './ports/report-repository';
import type { RetrievalClient } from './ports/retrieval-client';

export interface AnalysisLifecycleDeps {
  repository: ReportRepository;
  retrieval: RetrievalClient;
  /** Injectable for tests. */
  now?: () => Date;
  newId?: () => string;
}

/**
 * Owns the life of an analysis. Reports is the orchestrator: it creates the job, asks Retrieval
 * for the evidence and assembles the final report when the results arrive.
 *
 *   create()                      pending → retrieving      (calls Retrieval, answers 202)
 *   recordDeterministic(result)   retrieving → analyzing    (AI expected)  |  → ready (AI not expected)
 *   recordAi(result)              analyzing → ready
 *   recordFailure(failure)        stage "llm"       → ready, `degraded` with the reason
 *                                 stage "retrieval" → failed
 *   getReport(id)                 composeReport(...) → `Report` (+ renderMarkdown for the text view)
 *
 * Rules:
 * - The report never stays stuck: if the AI result does not arrive within REPORTS_AI_TIMEOUT_MS the
 *   report becomes `ready` and `degraded` (`llm-unavailable`).
 * - `aiExpected` = the client asked for AI AND the plan allows it. When it is false the report is
 *   not degraded: the AI layer was simply not part of it.
 * - A report is `degraded` only when AI was expected and could not run.
 *
 * TODO(area-4): implement.
 */
export class AnalysisLifecycle {
  private readonly deps: AnalysisLifecycleDeps;

  constructor(deps: AnalysisLifecycleDeps) {
    this.deps = deps;
  }

  async create(_job: CreateAnalysisJob): Promise<AnalysisAccepted> {
    void this.deps;
    throw new Error('TODO(area-4): AnalysisLifecycle.create is not implemented yet');
  }

  async recordDeterministic(_result: DeterministicResult): Promise<void> {
    throw new Error('TODO(area-4): AnalysisLifecycle.recordDeterministic is not implemented yet');
  }

  async recordAi(_result: AiResult): Promise<void> {
    throw new Error('TODO(area-4): AnalysisLifecycle.recordAi is not implemented yet');
  }

  async recordFailure(_failure: AnalysisFailure): Promise<void> {
    throw new Error('TODO(area-4): AnalysisLifecycle.recordFailure is not implemented yet');
  }

  async getReport(_analysisId: string): Promise<Report> {
    throw new Error('TODO(area-4): AnalysisLifecycle.getReport is not implemented yet');
  }
}
