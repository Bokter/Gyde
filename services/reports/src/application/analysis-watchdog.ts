import type { ReportRepository } from '../domain/repositories/report.repository';

/** Which watchdog is being scheduled, so a test double can react only to the one it cares about. */
export type TimerName = 'ai' | 'retrieval';

/**
 * Arms a callback to run after `ms`. The composition root binds it to `setTimeout`; tests pass a
 * synchronous fake that fires it at once, or a no-op to skip it.
 */
export type Schedule = (fn: () => void, ms: number, timer?: TimerName) => void;

/** Where the watchdogs report their own failures. Kept minimal so `application` stays framework-free. */
export interface WatchdogLogger {
  error(message: string): void;
}

/** DI token of the `AnalysisWatchdog` collaborator (ADR 0011: explicit `@Inject`). */
export const ANALYSIS_WATCHDOG = Symbol('AnalysisWatchdog');

export interface AnalysisWatchdogOptions {
  schedule: Schedule;
  /** Receives a watchdog failure (e.g. the repository being down when the timeout fires). */
  logger?: WatchdogLogger;
  now?: () => Date;
  /** From config.REPORTS_AI_TIMEOUT_MS. */
  aiTimeoutMs: number;
  /** From config.REPORTS_RETRIEVAL_TIMEOUT_MS. */
  retrievalTimeoutMs: number;
}

/**
 * The two in-memory timers that keep an analysis from staying stuck:
 * - AI: if the AI result does not arrive in time, `analyzing` -> `ready` + degraded.
 * - Retrieval: if Retrieval accepted the job but never delivers, `retrieving` -> `failed`.
 *
 * A timer whose analysis already left the state it watches does nothing. Errors are caught and
 * sent to the logger so a broken repository cannot crash the process. The timers live in memory
 * and do not survive a restart: `SweepStaleAnalysesUseCase` covers what was in progress at that point.
 */
export class AnalysisWatchdog {
  constructor(
    private readonly repository: ReportRepository,
    private readonly options: AnalysisWatchdogOptions,
  ) {}

  private get now(): Date {
    return this.options.now ? this.options.now() : new Date();
  }

  armAiTimeout(analysisId: string): void {
    this.options.schedule(
      async () => {
        try {
          const analysis = await this.repository.get(analysisId);
          if (!analysis) return;
          if (!analysis.timeOutAi(this.now, 'timeout')) return; // AI already arrived
          await this.repository.update(analysis);
        } catch (err) {
          // Do not rethrow: a timer callback must not crash the process.
          this.options.logger?.error(
            `[reports] AI timeout update failed for ${analysisId}: ${err instanceof Error ? err.message : 'unknown error'}`,
          );
        }
      },
      this.options.aiTimeoutMs,
      'ai',
    );
  }

  armRetrievalTimeout(analysisId: string): void {
    this.options.schedule(
      async () => {
        try {
          const analysis = await this.repository.get(analysisId);
          if (!analysis) return;
          if (!analysis.timeOutRetrieval(this.now, 'timeout')) return; // Retrieval already delivered
          await this.repository.update(analysis);
        } catch (err) {
          this.options.logger?.error(
            `[reports] Retrieval timeout update failed for ${analysisId}: ${err instanceof Error ? err.message : 'unknown error'}`,
          );
        }
      },
      this.options.retrievalTimeoutMs,
      'retrieval',
    );
  }
}
