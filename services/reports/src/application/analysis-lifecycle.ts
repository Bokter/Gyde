import { randomUUID } from 'node:crypto';

import type {
  AiResult,
  AnalysisAccepted,
  AnalysisFailure,
  CreateAnalysisJob,
  DeterministicResult,
  Finding,
  Report,
  ReportLayer,
  ReportSummary,
  SeverityCounts,
} from '@gyde/contracts';

import { composeReport } from '../domain/report/compose-report';
import type { ReportRepository, StoredAnalysis } from './ports/report-repository';
import type { RetrievalClient } from './ports/retrieval-client';

export interface AnalysisLifecycleDeps {
  repository: ReportRepository;
  retrieval: RetrievalClient;
  /** Injectable for tests. */
  now?: () => Date;
  newId?: () => string;
  /**
   * Injectable for tests: avoids real setTimeout calls.
   * Pass a synchronous fake that immediately executes fn() to simulate a timeout firing,
   * or a no-op to skip it entirely. Defaults to global setTimeout.
   */
  schedule?: (fn: () => void, ms: number) => void;
  /** Read from config.REPORTS_AI_TIMEOUT_MS. Defaults to 60 000 ms. */
  aiTimeoutMs?: number;
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
  const failedRetrieval = stored.failure?.stage === 'retrieval';
  const degraded =
    stored.failure !== undefined && stored.failure.stage === 'llm' && stored.aiExpected;

  let appliedLayers: ReportLayer[] = ['basic'];
  let summary: ReportSummary = {
    counts: countBySeverity(stored.deterministic?.findings ?? []),
  };
  let findings: Finding[] = stored.deterministic?.findings ?? [];

  if (stored.deterministic) {
    const component = composeReport({
      deterministic: stored.deterministic,
      ai: stored.ai,
      entitlements: stored.entitlements,
    });
    const generated = component.generateContent();
    appliedLayers = [...generated.appliedLayers];
    summary = {
      counts: countBySeverity(generated.findings),
      ...(generated.riskScore !== undefined ? { riskScore: generated.riskScore } : {}),
    };
    findings = [...generated.findings];
  }

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
    appliedLayers,
    summary,
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
 *   getReport(id)                 toReport(stored) → `Report`
 *
 * Rules:
 * - The report never stays stuck: if the AI result does not arrive within REPORTS_AI_TIMEOUT_MS the
 *   report becomes `ready` and `degraded` (`llm-unavailable`).
 * - `aiExpected` = the client asked for AI AND the plan allows it. When it is false the report is
 *   not degraded: the AI layer was simply not part of it.
 * - A report is `degraded` only when AI was expected and could not run.
 * - `partialSources` from Retrieval does NOT make a report degraded: it only means some knowledge
 *   sources were unavailable, but the deterministic findings are still valid.
 * - NOTE: the in-memory timer does not survive a service restart. A startup sweep that transitions
 *   stale `analyzing` jobs to `ready + degraded` is planned for PR E (PostgreSQL persistence).
 */
export class AnalysisLifecycle {
  private readonly deps: AnalysisLifecycleDeps;

  constructor(deps: AnalysisLifecycleDeps) {
    this.deps = deps;
  }

  private get now(): () => Date {
    return this.deps.now ?? (() => new Date());
  }

  async create(job: CreateAnalysisJob): Promise<AnalysisAccepted> {
    const now = this.now;
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

  /**
   * Called by Retrieval when the deterministic pass finishes.
   * - If AI was expected: moves to `analyzing` and starts the timeout watchdog.
   * - If AI was not expected: moves directly to `ready`.
   */
  async recordDeterministic(result: DeterministicResult): Promise<void> {
    const stored = await this.deps.repository.get(result.analysisId);
    if (!stored) throw new Error(`Analysis ${result.analysisId} not found`);

    if (stored.aiExpected) {
      await this.deps.repository.update({
        ...stored,
        deterministic: result,
        status: 'analyzing',
      });
      this.scheduleAiTimeout(result.analysisId);
    } else {
      await this.deps.repository.update({
        ...stored,
        deterministic: result,
        status: 'ready',
        completedAt: this.now().toISOString(),
      });
    }
  }

  /**
   * Called by llm-analysis when the AI enrichment finishes.
   * Ignores late results that arrive after the job is already `ready` or `failed`
   * (e.g. after the timeout fired).
   */
  async recordAi(result: AiResult): Promise<void> {
    const stored = await this.deps.repository.get(result.analysisId);
    if (!stored) throw new Error(`Analysis ${result.analysisId} not found`);

    // Late delivery: the timeout already fired and the job is done.
    if (stored.status === 'ready' || stored.status === 'failed') return;

    await this.deps.repository.update({
      ...stored,
      ai: result,
      status: 'ready',
      completedAt: this.now().toISOString(),
    });
  }

  /**
   * Called by Retrieval or llm-analysis when a stage cannot complete.
   * - `stage "llm"` → `ready` + degraded (only when AI was expected; otherwise ignored).
   * - `stage "retrieval"` → `failed`.
   * Ignores the call if the job is already `ready` or `failed`.
   */
  async recordFailure(failure: AnalysisFailure): Promise<void> {
    const stored = await this.deps.repository.get(failure.analysisId);
    if (!stored) throw new Error(`Analysis ${failure.analysisId} not found`);

    // Already done (timeout fired, duplicate delivery, etc.).
    if (stored.status === 'ready' || stored.status === 'failed') return;

    if (failure.stage === 'llm') {
      // A report is degraded only when AI was expected and could not run.
      if (!stored.aiExpected) return;

      await this.deps.repository.update({
        ...stored,
        status: 'ready',
        completedAt: this.now().toISOString(),
        failure,
      });
    } else {
      // stage === 'retrieval'
      await this.deps.repository.update({
        ...stored,
        status: 'failed',
        completedAt: this.now().toISOString(),
        failure,
      });
    }
  }

  async getReport(analysisId: string): Promise<Report> {
    const stored = await this.deps.repository.get(analysisId);
    if (!stored) {
      throw new Error(`Analysis ${analysisId} was not found`);
    }
    return toReport(stored);
  }

  /**
   * Fires after REPORTS_AI_TIMEOUT_MS: if the job is still `analyzing`, it transitions to
   * `ready + degraded(llm-unavailable)`.
   * Errors are caught and logged so a broken repository cannot crash the process.
   * NOTE: this timer lives in memory and does not survive a service restart. PR E will add a
   * startup sweep that handles stale `analyzing` jobs when PostgreSQL persistence lands.
   */
  private scheduleAiTimeout(analysisId: string): void {
    const schedule = this.deps.schedule ?? setTimeout;
    const ms = this.deps.aiTimeoutMs ?? 60_000;

    schedule(async () => {
      try {
        const stored = await this.deps.repository.get(analysisId);
        if (!stored || stored.status !== 'analyzing') return; // AI already arrived

        await this.deps.repository.update({
          ...stored,
          status: 'ready',
          completedAt: this.now().toISOString(),
          failure: {
            analysisId,
            stage: 'llm',
            reason: 'llm-unavailable',
            message: 'AI result did not arrive within the timeout window',
          },
        });
      } catch (err) {
        // Do not rethrow: a timer callback must not crash the process.
        console.error(`[reports] AI timeout update failed for ${analysisId}:`, err);
      }
    }, ms);
  }
}
