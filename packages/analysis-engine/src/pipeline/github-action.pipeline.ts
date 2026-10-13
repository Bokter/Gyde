import type { AnalysisRequest, AuthVerifyResponse, Report } from '@gyde/contracts';

import { AnalysisPipeline, type AnalysisPipelineDeps } from './analysis-pipeline';

export interface GitHubActionPipelineOptions extends AnalysisPipelineDeps {
  /** GITHUB_WORKSPACE of the runner. */
  workspace: string;
  clientVersion: string;
}

/**
 * ConcreteClass: the GitHub Action. Reads the runner's environment variables and workspace, and
 * publishes the report as a pull request comment.
 *
 * TODO(area-2/area-4): implement the two hooks. The Action app (`apps/github-action`) builds this
 * pipeline; the comment itself is posted with the token the workflow provides.
 */
export class GitHubActionPipeline extends AnalysisPipeline {
  protected readonly options: GitHubActionPipelineOptions;

  constructor(options: GitHubActionPipelineOptions) {
    super(options);
    this.options = options;
  }

  protected async parseDependencies(_session: AuthVerifyResponse): Promise<AnalysisRequest> {
    throw new Error('TODO(area-4): GitHubActionPipeline.parseDependencies is not implemented yet');
  }

  protected async publishResult(_report: Report): Promise<void> {
    throw new Error('TODO(area-2): GitHubActionPipeline.publishResult is not implemented yet');
  }
}
