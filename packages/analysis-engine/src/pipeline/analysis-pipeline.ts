import type {
  AnalysisRequest,
  AuthVerifyResponse,
  ClientInfo,
  Finding,
  Report,
} from '@gyde/contracts';

import { buildAnalysisRequest } from '../privacy/build-analysis-request';
import type { AnalysisToolchainFactory } from '../toolchain/ports';
import type { AnalysisGateway, AnalysisJob } from '../types';

import { waitForReport, type WaitOptions } from './wait-for-report';

export interface AnalysisPipelineDeps {
  gateway: AnalysisGateway;
  toolchain: AnalysisToolchainFactory;
  /** Polling interval and timeout while waiting for the remote stages. */
  wait?: WaitOptions;
}

/**
 * TEMPLATE METHOD (architecture doc, "Patrones de diseño 2").
 *
 * `runAnalysis()` fixes the order of the algorithm. Subclasses (LocalCLIPipeline,
 * GitHubActionPipeline) only fill in the environment-specific hooks; they must never override
 * `runAnalysis`, reorder the steps or skip the key validation. An architecture test enforces it.
 *
 *   1 authenticateKey     invariant   validate API key and plan
 *   2 parseDependencies   HOOK        local extraction (disk in the CLI, runner workspace in CI)
 *   - submitAnalysis      invariant   send ONE request with names/versions/licenses only
 *   3 fetchVulnerabilities invariant  deterministic stage of the remote analysis (Abstract Factory)
 *   4 analyzeLicenses     invariant   deterministic stage of the remote analysis
 *   5 generateReport      invariant   final report (AI + decorators, or degraded)
 *   6 publishResult       HOOK        console output or pull request comment
 *
 * Steps 3-5 are stages of the same remote job (`retrieving` → `analyzing` → `ready`), not three
 * separate round trips: the backend orchestrates (see docs/adr/).
 */
export abstract class AnalysisPipeline {
  protected readonly gateway: AnalysisGateway;
  protected readonly toolchain: AnalysisToolchainFactory;
  protected readonly wait: WaitOptions;

  constructor({ gateway, toolchain, wait }: AnalysisPipelineDeps) {
    this.gateway = gateway;
    this.toolchain = toolchain;
    this.wait = wait ?? {};
  }

  /** The template method. Do not override it. */
  async runAnalysis(): Promise<Report> {
    const session = await this.authenticateKey();
    const request = await this.parseDependencies(session);
    const job = await this.submitAnalysis(request);
    await this.fetchVulnerabilities(job);
    await this.analyzeLicenses(job);
    const report = await this.generateReport(job);
    await this.publishResult(report);
    return report;
  }

  // --- Invariant steps: identical in every environment ---------------------------------------

  protected async authenticateKey(): Promise<AuthVerifyResponse> {
    return this.gateway.verifyKey();
  }

  protected async submitAnalysis(request: AnalysisRequest): Promise<AnalysisJob> {
    const accepted = await this.gateway.submitAnalysis(request);
    return { analysisId: accepted.analysisId };
  }

  protected async fetchVulnerabilities(job: AnalysisJob): Promise<Finding[]> {
    return this.toolchain.createVulnerabilityFetcher().fetchVulnerabilities(job);
  }

  /** Deterministic stage of the remote job: the license findings (`kind === 'license'`). */
  protected async analyzeLicenses(job: AnalysisJob): Promise<Finding[]> {
    const report = await waitForReport(this.gateway, job, 'deterministic', this.wait);
    return report.findings.filter((finding) => finding.kind === 'license');
  }

  /**
   * Waits for the final report (`ready`). A `failed` analysis raises a clear error with the
   * report's message; if the gateway is unreachable `GydeApiClient` serves the last cached report
   * flagged `degraded`.
   */
  protected async generateReport(job: AnalysisJob): Promise<Report> {
    return waitForReport(this.gateway, job, 'ready', this.wait);
  }

  /** Shared by the two concrete pipelines: parse locally and pass through the privacy gate. */
  protected async buildRequest(
    client: ClientInfo,
    includeAi: boolean | undefined,
  ): Promise<AnalysisRequest> {
    const parsed = await this.toolchain.createDependencyParser().parseDependencies();
    return buildAnalysisRequest({ parsed, client, options: { includeAi: includeAi ?? true } });
  }

  // --- Hooks: environment specific -----------------------------------------------------------

  /** Extract names, versions and licenses locally and build the (strict) AnalysisRequest. */
  protected abstract parseDependencies(session: AuthVerifyResponse): Promise<AnalysisRequest>;

  /** Show the result where the user is: terminal, pull request comment, editor panel. */
  protected abstract publishResult(report: Report): Promise<void>;
}
