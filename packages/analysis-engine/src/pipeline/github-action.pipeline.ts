import type { AnalysisRequest, AuthVerifyResponse, Report } from '@gyde/contracts';

import { AnalysisPipeline, type AnalysisPipelineDeps } from './analysis-pipeline';

export interface GitHubActionPipelineOptions extends AnalysisPipelineDeps {
  /** GITHUB_WORKSPACE of the runner. */
  workspace: string;
  clientVersion: string;
  /** Ask for the AI layer (default `true`). */
  includeAi?: boolean;
}

/**
 * ConcreteClass: the GitHub Action. Reads the runner's environment variables and workspace, and
 * publishes the report as a pull request comment.
 *
 * `parseDependencies` is the same logic as the CLI (area 4). `publishResult` (the PR comment,
 * posted with the token the workflow provides) belongs to area 2: `apps/github-action` builds this
 * pipeline and fills that hook.
 */
export class GitHubActionPipeline extends AnalysisPipeline {
  protected readonly options: GitHubActionPipelineOptions;

  constructor(options: GitHubActionPipelineOptions) {
    super(options);
    this.options = options;
  }

  protected async parseDependencies(_session: AuthVerifyResponse): Promise<AnalysisRequest> {
    return this.buildRequest(
      { kind: 'github-action', version: this.options.clientVersion },
      this.options.includeAi,
    );
  }

  protected async publishResult(_report: Report): Promise<void> {
    throw new Error('TODO(area-2): GitHubActionPipeline.publishResult is not implemented yet');
  }
}
