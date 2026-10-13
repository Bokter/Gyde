import { readFile } from 'node:fs/promises';

/** The pull request the workflow runs for, or `null` (push, schedule, manual run...). */
export interface PullRequestRef {
  owner: string;
  repo: string;
  number: number;
}

type Env = Record<string, string | undefined>;

const PULL_REQUEST_EVENTS = new Set(['pull_request', 'pull_request_target']);

export async function pullRequestFromEnv(
  env: Env,
  read: (path: string) => Promise<string> = (path) => readFile(path, 'utf8'),
): Promise<PullRequestRef | null> {
  if (!PULL_REQUEST_EVENTS.has(env.GITHUB_EVENT_NAME ?? '') || !env.GITHUB_EVENT_PATH) return null;
  const [owner, repo] = (env.GITHUB_REPOSITORY ?? '').split('/');
  if (!owner || !repo) return null;

  const event = JSON.parse(await read(env.GITHUB_EVENT_PATH)) as {
    pull_request?: { number?: unknown };
  };
  const number = event.pull_request?.number;
  return typeof number === 'number' ? { owner, repo, number } : null;
}
