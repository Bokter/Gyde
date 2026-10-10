import { randomUUID } from 'node:crypto';

import type {
  AiResult,
  AnalysisAccepted,
  AnalysisFailure,
  CreateAnalysisJob,
  DeterministicResult,
  Finding,
  Report,
  SeverityCounts,
} from '@gyde/contracts';

import type { ReportRepository, StoredAnalysis } from './ports/report-repository';
import type { RetrievalClient } from './ports/retrieval-client';

export interface AnalysisLifecycleDeps {
  repository: ReportRepository;
  retrieval: RetrievalClient;
  /** Injectable for tests. */
  now?: () => Date;
  newId?: () => string;
}

function countBySeverity(findings: Finding[]): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}

/** DI token of the `AnalysisLifecycle` use case (ADR 0011: explicit `@Inject`). */
export const ANALYSIS_LIFECYCLE = Symbol('AnalysisLifecycle');

/** Derives the public Report from what the service has stored so far. */
function toReport(stored: StoredAnalysis): Report {
  const findings = stored.deterministic?.findings ?? [];
  const failedRetrieval = stored.failure?.stage === 'retrieval';
  const degraded =
    stored.failure !== undefined && stored.failure.stage === 'llm' && stored.aiExpected;

  return {
    id: stored.id,
    status: stored.status,
    createdAt: stored.createdAt,
    ...(stored.completedAt !== undefined ? { completedAt: stored.completedAt } : {}),
    degraded,
    ...(degraded && stored.failure
      ? {
          degradedReason: stored.failure.reason as
            'llm-unavailable' | 'llm-not-configured' | 'llm-error',
        }
      : {}),
    appliedLayers: ['basic'],
    summary: { counts: countBySeverity(findings) },
    findings,
    ...(failedRetrieval && stored.failure
      ? { error: { code: 'internal' as const, message: stored.failure.message } }
      : {}),
  };
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
 */
export class AnalysisLifecycle {
  private readonly deps: AnalysisLifecycleDeps;

  constructor(deps: AnalysisLifecycleDeps) {
    this.deps = deps;
  }

  async create(job: CreateAnalysisJob): Promise<AnalysisAccepted> {
    const now = this.deps.now ?? (() => new Date());
    const newId = this.deps.newId ?? (() => randomUUID());
    const id = newId();
    const aiExpected = job.request.options.includeAi && job.entitlements.features.aiEnrichment;

    const stored: StoredAnalysis = {
      id,
      tenantId: job.tenantId,
      entitlements: job.entitlements,
      aiExpected,
      status: 'retrieving',
      createdAt: now().toISOString(),
    };
    await this.deps.repository.create(stored);

    try {
      await this.deps.retrieval.retrieve({
        analysisId: id,
        tenantId: job.tenantId,
        entitlements: job.entitlements,
        request: job.request,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Retrieval is unavailable';
      await this.deps.repository.update({
        ...stored,
        status: 'failed',
        completedAt: now().toISOString(),
        failure: {
          analysisId: id,
          stage: 'retrieval',
          reason: 'retrieval-error',
          message,
        },
      });
    }

    return { analysisId: id, status: 'retrieving' };
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

  async getReport(analysisId: string): Promise<Report> {
    const stored = await this.deps.repository.get(analysisId);
    if (!stored) {
      throw new Error(`Analysis ${analysisId} was not found`);
    }
    return toReport(stored);
  }
}
