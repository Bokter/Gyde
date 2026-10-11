import type { Report } from '@gyde/contracts';

import type { AnalysisGateway, AnalysisJob } from '../types';

/** How the client waits for the remote analysis. Everything is injectable so tests use no timers. */
export interface WaitOptions {
  /** Time between two polls. Defaults to 500 ms. */
  pollIntervalMs?: number;
  /** Total time to wait for a stage. Defaults to 60 000 ms. */
  timeoutMs?: number;
  /** Injectable for tests. Defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * The two points of the remote job the client waits for:
 * - `deterministic`: findings are available (`analyzing` or `ready`), whatever the AI does later.
 * - `ready`: the final report.
 */
export type ReportStage = 'deterministic' | 'ready';

/** The analysis ended as `failed`, or did not reach the stage in time. Never carries the API key. */
export class AnalysisWaitError extends Error {
  readonly reason: 'failed' | 'timeout';

  constructor(reason: 'failed' | 'timeout', message: string) {
    super(message);
    this.name = 'AnalysisWaitError';
    this.reason = reason;
  }
}

const DEFAULT_POLL_INTERVAL_MS = 500;
const DEFAULT_TIMEOUT_MS = 60_000;

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Last report seen per job in this run. The three remote stages (vulnerabilities, licenses, final
 * report) share it, so a stage that is already satisfied costs no extra request.
 */
const snapshots = new WeakMap<AnalysisJob, Report>();

function reached(report: Report, stage: ReportStage): boolean {
  return stage === 'ready'
    ? report.status === 'ready'
    : report.status === 'analyzing' || report.status === 'ready';
}

/**
 * Polls `gateway.getReport` until the job reaches `stage`. Throws `AnalysisWaitError` when the
 * analysis ends `failed` or the timeout expires. If the gateway is unreachable, `GydeApiClient`
 * already answers with the last cached report flagged `degraded`; that report is returned as long
 * as it satisfies the stage.
 */
export async function waitForReport(
  gateway: AnalysisGateway,
  job: AnalysisJob,
  stage: ReportStage,
  options: WaitOptions = {},
): Promise<Report> {
  const known = snapshots.get(job);
  if (known && reached(known, stage)) return known;

  const interval = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sleep = options.sleep ?? realSleep;

  let waited = 0;
  for (;;) {
    const report = await gateway.getReport(job.analysisId);
    snapshots.set(job, report);

    if (report.status === 'failed') {
      throw new AnalysisWaitError(
        'failed',
        `Analysis ${job.analysisId} failed: ${report.error?.message ?? 'no details were given'}`,
      );
    }
    if (reached(report, stage)) return report;

    if (waited >= timeout) {
      throw new AnalysisWaitError(
        'timeout',
        `Analysis ${job.analysisId} did not reach "${stage}" within ${timeout} ms (last status: ${report.status})`,
      );
    }
    await sleep(interval);
    waited += interval;
  }
}
