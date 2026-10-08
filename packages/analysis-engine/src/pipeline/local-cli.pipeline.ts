import type { AnalysisRequest, AuthVerifyResponse, Report } from '@gyde/contracts';

import { AnalysisPipeline, type AnalysisPipelineDeps } from './analysis-pipeline';

export interface LocalCliPipelineOptions extends AnalysisPipelineDeps {
  projectRoot: string;
  clientVersion: string;
  /** Where to print; defaults to the terminal. */
  output?: (line: string) => void;
}

/**
 * ConcreteClass: the CLI / VS Code terminal. Reads files straight from disk and prints the
 * report in the console.
 *
 * TODO(area-4): implement the two hooks (use `toolchain.createDependencyParser()` and the
 * privacy sanitizer `buildAnalysisRequest`).
 */
export class LocalCLIPipeline extends AnalysisPipeline {
  protected readonly options: LocalCliPipelineOptions;

  constructor(options: LocalCliPipelineOptions) {
    super(options);
    this.options = options;
  }

  protected async parseDependencies(_session: AuthVerifyResponse): Promise<AnalysisRequest> {
    throw new Error('TODO(area-4): LocalCLIPipeline.parseDependencies is not implemented yet');
  }

  protected async publishResult(_report: Report): Promise<void> {
    throw new Error('TODO(area-4): LocalCLIPipeline.publishResult is not implemented yet');
  }
}
