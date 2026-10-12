import {
  GitHubActionPipeline,
  formatReportText,
  type GitHubActionPipelineOptions,
} from '@gyde/analysis-engine';
import type { Report } from '@gyde/contracts';

export interface PullRequestCommentPipelineOptions extends GitHubActionPipelineOptions {
  /** Shows the rendered report where the user is: job summary and pull request comment. */
  publish: (markdown: string, report: Report) => Promise<void>;
  /** Told when the backend could not render Markdown and the plain text is used instead. */
  onMarkdownUnavailable?: () => void;
}

/**
 * Fills the `publishResult` hook of the engine's `GitHubActionPipeline` (area 2). The template
 * method and the other steps are the engine's: this class only renders and hands the result over.
 */
export class PullRequestCommentPipeline extends GitHubActionPipeline {
  private readonly publish: PullRequestCommentPipelineOptions['publish'];
  private readonly onMarkdownUnavailable?: () => void;

  constructor(options: PullRequestCommentPipelineOptions) {
    super(options);
    this.publish = options.publish;
    this.onMarkdownUnavailable = options.onMarkdownUnavailable;
  }

  protected override async publishResult(report: Report): Promise<void> {
    await this.publish(await this.render(report), report);
  }

  /** The backend's Markdown; if it cannot be fetched, the engine's text rendering. */
  private async render(report: Report): Promise<string> {
    try {
      return await this.gateway.getMarkdown(report.id);
    } catch {
      this.onMarkdownUnavailable?.();
      const text = formatReportText(report);
      // Longer than any backtick run in the text, so report content cannot close the block.
      const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
      const fence = '`'.repeat(Math.max(3, longest + 1));
      return [`${fence}text`, text, fence].join('\n');
    }
  }
}
