import type { AnalysisRequest, AuthVerifyResponse, Finding, Report } from '@gyde/contracts';

import type { AnalysisToolchainFactory } from '../toolchain/ports';
import type { AnalysisGateway, AnalysisJob } from '../types';

export interface AnalysisPipelineDeps {
  gateway: AnalysisGateway;
  toolchain: AnalysisToolchainFactory;
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

  constructor({ gateway, toolchain }: AnalysisPipelineDeps) {
    this.gateway = gateway;
    this.toolchain = toolchain;
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

  /** TODO(area-4): wait for the deterministic stage and return the license findings. */
  protected async analyzeLicenses(_job: AnalysisJob): Promise<Finding[]> {
    throw new Error('TODO(area-4): AnalysisPipeline.analyzeLicenses is not implemented yet');
  }

  /**
   * TODO(area-4): poll `gateway.getReport` until `ready` (or `failed`), with a timeout. If the
   * gateway is unreachable, serve the last cached report flagged as degraded.
   */
  protected async generateReport(_job: AnalysisJob): Promise<Report> {
    throw new Error('TODO(area-4): AnalysisPipeline.generateReport is not implemented yet');
  }

  // --- Hooks: environment specific -----------------------------------------------------------

  /** Extract names, versions and licenses locally and build the (strict) AnalysisRequest. */
  protected abstract parseDependencies(session: AuthVerifyResponse): Promise<AnalysisRequest>;

  /** Show the result where the user is: terminal, pull request comment, editor panel. */
  protected abstract publishResult(report: Report): Promise<void>;
}
