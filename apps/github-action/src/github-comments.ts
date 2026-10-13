import { COMMENT_MARKER } from './comment-body';
import type { PullRequestRef } from './pull-request';

/** A GitHub REST call failed. `status` lets the caller tell "no permission" (403) apart. */
export class GitHubApiError extends Error {
  readonly status: number;

  constructor(status: number, operation: string) {
    super(`GitHub answered HTTP ${status} to ${operation}`);
    this.name = 'GitHubApiError';
    this.status = status;
  }
}

/** The account the default `GITHUB_TOKEN` comments as. */
export const ACTIONS_BOT = 'github-actions[bot]';

interface IssueComment {
  id: number;
  body?: string;
  user?: { login?: string } | null;
}

export interface GitHubCommentsOptions {
  /** `GITHUB_API_URL` (GitHub Enterprise Server has its own). */
  apiUrl: string;
  token: string;
  fetch?: typeof fetch;
}

/**
 * The few GitHub REST endpoints the action needs, over plain `fetch`. Keeps a single Gyde comment
 * per pull request: the one with the marker written by the same account is edited, never a
 * comment of somebody else that happens to contain the marker.
 */
export class GitHubComments {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: GitHubCommentsOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  async upsert(pr: PullRequestRef, body: string): Promise<'created' | 'updated'> {
    const author = await this.authenticatedLogin();
    const existing = await this.findOwnComment(pr, author);
    const repo = `/repos/${pr.owner}/${pr.repo}`;
    if (existing) {
      await this.call('PATCH', `${repo}/issues/comments/${existing.id}`, 'update the comment', {
        body,
      });
      return 'updated';
    }
    await this.call('POST', `${repo}/issues/${pr.number}/comments`, 'create the comment', { body });
    return 'created';
  }

  /**
   * A personal token can read `/user`; the workflow's `GITHUB_TOKEN` cannot (it is an app
   * installation token) and always comments as `github-actions[bot]`.
   */
  private async authenticatedLogin(): Promise<string> {
    const response = await this.send('GET', '/user');
    if (!response.ok) return ACTIONS_BOT;
    const user = (await response.json()) as { login?: string };
    return user.login ?? ACTIONS_BOT;
  }

  private async findOwnComment(pr: PullRequestRef, author: string): Promise<IssueComment | null> {
    for (let page = 1; ; page += 1) {
      const comments = (await this.call(
        'GET',
        `/repos/${pr.owner}/${pr.repo}/issues/${pr.number}/comments?per_page=100&page=${page}`,
        'list the comments',
      )) as IssueComment[];
      const own = comments.find(
        (c) => c.user?.login === author && (c.body ?? '').startsWith(COMMENT_MARKER),
      );
      if (own) return own;
      if (comments.length < 100) return null;
    }
  }

  private async call(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    operation: string,
    body?: unknown,
  ): Promise<unknown> {
    const response = await this.send(method, path, body);
    if (!response.ok) throw new GitHubApiError(response.status, operation);
    return response.json();
  }

  private send(method: string, path: string, body?: unknown): Promise<Response> {
    return this.fetchImpl(`${this.options.apiUrl.replace(/\/+$/, '')}${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${this.options.token}`,
        'x-github-api-version': '2022-11-28',
        'user-agent': 'gyde-action',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
}
