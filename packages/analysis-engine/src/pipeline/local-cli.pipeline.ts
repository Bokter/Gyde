import type { AnalysisRequest, AuthVerifyResponse, Report } from '@gyde/contracts';

import { formatReportText } from '../report/format-text';

import { AnalysisPipeline, type AnalysisPipelineDeps } from './analysis-pipeline';

export interface LocalCliPipelineOptions extends AnalysisPipelineDeps {
  projectRoot: string;
  clientVersion: string;
  /** Ask for the AI layer (default `true`); the CLI's `--no-ai` sets it to `false`. */
  includeAi?: boolean;
  /**
   * Where to print the text report. When absent nothing is printed (no `console.log`): the caller
   * decides how to show the returned report.
   */
  output?: (text: string) => void;
}

/**
 * ConcreteClass: the CLI / VS Code terminal. Reads files straight from disk (through the toolchain's
 * parser and the privacy gate) and prints the report through the injected `output`.
 *
 * It never touches `process`: the exit code is derived from the returned report by the caller
 * (see `exitCodeForReport`).
 */
export class LocalCLIPipeline extends AnalysisPipeline {
  protected readonly options: LocalCliPipelineOptions;

  constructor(options: LocalCliPipelineOptions) {
    super(options);
    this.options = options;
  }

  protected async parseDependencies(_session: AuthVerifyResponse): Promise<AnalysisRequest> {
    return this.buildRequest(
      { kind: 'cli', version: this.options.clientVersion },
      this.options.includeAi,
    );
  }

  protected async publishResult(report: Report): Promise<void> {
    this.options.output?.(formatReportText(report));
  }
}
