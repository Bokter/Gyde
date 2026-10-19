import type {
  AiResult,
  AnalysisFailure,
  AnalysisSnapshot,
  AnalysisStatus,
  DeterministicResult,
  Entitlements,
} from './analysis-types';

/** What a new analysis is born from. */
export interface NewAnalysis {
  id: string;
  tenantId: string;
  entitlements: Entitlements;
  /** The client asked for the AI layer (still subject to the plan). */
  includeAi: boolean;
}

/** What a watchdog or the startup sweep is closing: changes only the message of the failure. */
export type TimeoutCause = 'timeout' | 'restart';

/** Outcome of a deterministic delivery: nothing changed, or where the analysis went. */
export type DeterministicOutcome = 'ignored' | 'ready' | 'analyzing';

const AI_TIMEOUT_MESSAGE: Record<TimeoutCause, string> = {
  timeout: 'AI result did not arrive within the timeout window',
  restart: 'AI result did not arrive before the service restarted',
};

const RETRIEVAL_TIMEOUT_MESSAGE: Record<TimeoutCause, string> = {
  timeout: 'Retrieval did not deliver a result within the timeout window',
  restart: 'Retrieval did not deliver a result before the service restarted',
};

/**
 * One analysis and the rules of its life. Reports orchestrates the job: it asks Retrieval for the
 * evidence, waits for the AI layer when the plan allows it and assembles the report.
 *
 *   create                       -> retrieving
 *   recordDeterministic          retrieving -> analyzing (AI expected) | ready (AI not expected,
 *                                or the AI result already arrived)
 *   recordAi                     analyzing -> ready; kept aside while no deterministic result
 *   recordFailure (llm)          -> ready, degraded (only when AI was expected)
 *   recordFailure (retrieval)    -> failed
 *   timeOutAi / timeOutRetrieval analyzing -> ready (llm-unavailable) | retrieving -> failed
 *
 * A delivery that does not fit the current state is ignored: the mutator returns false (or
 * 'ignored') and the state does not change, so the caller must not persist anything. `pending`
 * exists in the vocabulary but no transition writes it.
 *
 * Id and time come in as arguments: the entity never reads a clock nor generates ids.
 */
export class Analysis {
  private state: AnalysisSnapshot;

  private constructor(state: AnalysisSnapshot) {
    this.state = state;
  }

  static create(input: NewAnalysis, now: Date): Analysis {
    return new Analysis({
      id: input.id,
      tenantId: input.tenantId,
      entitlements: input.entitlements,
      aiExpected: input.includeAi && input.entitlements.features.aiEnrichment,
      status: 'retrieving',
      createdAt: now.toISOString(),
    });
  }

  static rehydrate(snapshot: AnalysisSnapshot): Analysis {
    return new Analysis({ ...snapshot });
  }

  get id(): string {
    return this.state.id;
  }

  get status(): AnalysisStatus {
    return this.state.status;
  }

  /**
   * An analysis of another tenant (or a call without tenant) must answer exactly like one that
   * does not exist, so ownership is a question the entity answers and callers do not inspect.
   */
  isOwnedBy(tenantId: string | undefined): boolean {
    return this.state.tenantId === tenantId;
  }

  snapshot(): AnalysisSnapshot {
    return { ...this.state };
  }

  /**
   * Retrieval delivered the deterministic pass. Anything but `retrieving` is a duplicate and is
   * ignored: it never overwrites a result nor drags a finished analysis back to `analyzing`.
   */
  recordDeterministic(result: DeterministicResult, now: Date): DeterministicOutcome {
    if (this.state.status !== 'retrieving') return 'ignored';

    // The AI result got here first: with both in hand the report is complete.
    if (this.state.aiExpected && this.state.ai) {
      this.state = {
        ...this.state,
        deterministic: result,
        status: 'ready',
        completedAt: now.toISOString(),
      };
      return 'ready';
    }

    if (this.state.aiExpected) {
      this.state = { ...this.state, deterministic: result, status: 'analyzing' };
      return 'analyzing';
    }

    this.state = {
      ...this.state,
      deterministic: result,
      status: 'ready',
      completedAt: now.toISOString(),
    };
    return 'ready';
  }

  /**
   * llm-analysis delivered the AI enrichment. Late results (job already `ready` or `failed`) are
   * ignored. Without the deterministic result there is no report to complete, so the AI result
   * is kept and the job stays where it is. Returns whether the state changed.
   */
  recordAi(result: AiResult, now: Date): boolean {
    if (this.isFinished()) return false;

    if (!this.state.deterministic) {
      this.state = { ...this.state, ai: result };
      return true;
    }

    this.state = { ...this.state, ai: result, status: 'ready', completedAt: now.toISOString() };
    return true;
  }

  /**
   * A stage could not complete. `llm` -> `ready` + degraded, only when AI was expected (otherwise
   * ignored); `retrieval` -> `failed`. Ignored once the job is `ready` or `failed`.
   */
  recordFailure(failure: AnalysisFailure, now: Date): boolean {
    if (this.isFinished()) return false;

    if (failure.stage === 'llm') {
      if (!this.state.aiExpected) return false;
      this.state = {
        ...this.state,
        status: 'ready',
        completedAt: now.toISOString(),
        failure,
      };
      return true;
    }

    this.state = { ...this.state, status: 'failed', completedAt: now.toISOString(), failure };
    return true;
  }

  /** The AI result never arrived: a job still `analyzing` becomes `ready` and degraded. */
  timeOutAi(now: Date, cause: TimeoutCause): boolean {
    if (this.state.status !== 'analyzing') return false;
    this.state = {
      ...this.state,
      status: 'ready',
      completedAt: now.toISOString(),
      failure: {
        analysisId: this.state.id,
        stage: 'llm',
        reason: 'llm-unavailable',
        message: AI_TIMEOUT_MESSAGE[cause],
      },
    };
    return true;
  }

  /** Retrieval never delivered: a job still `retrieving` becomes `failed`. */
  timeOutRetrieval(now: Date, cause: TimeoutCause): boolean {
    if (this.state.status !== 'retrieving') return false;
    this.state = {
      ...this.state,
      status: 'failed',
      completedAt: now.toISOString(),
      failure: {
        analysisId: this.state.id,
        stage: 'retrieval',
        reason: 'retrieval-error',
        message: RETRIEVAL_TIMEOUT_MESSAGE[cause],
      },
    };
    return true;
  }

  private isFinished(): boolean {
    return this.state.status === 'ready' || this.state.status === 'failed';
  }
}
