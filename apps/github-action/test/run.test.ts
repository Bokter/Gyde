import { resolve } from 'node:path';

import type { AnalysisGateway } from '@gyde/analysis-engine';
import { PLAN_CATALOG, type Report } from '@gyde/contracts';
import { sampleReportDegraded, sampleReportReady } from '@gyde/contracts/samples';
import { beforeEach, describe, expect, it } from 'vitest';

import { COMMENT_MARKER } from '../src/comment-body';
import { ACTIONS_BOT } from '../src/github-comments';
import { run, type ActionIo } from '../src/run';

const WORKSPACE = resolve(import.meta.dirname, '../../../fixtures/projects');
const API_KEY = 'gyde_test_key_0123456789_do_not_print';
const PR_EVENT = '/runner/event.json';

interface Comment {
  id: number;
  body: string;
  user: { login: string };
}

/** In-memory GitHub REST API: the issue comments of PR #7 and what the action sent. */
class FakeGitHub {
  comments: Comment[] = [];
  calls: string[] = [];
  /** Status for comment writes, e.g. 403 for a fork's read-only token. */
  writeStatus = 200;

  readonly fetch = (async (url: string, init: RequestInit) => {
    const { pathname } = new URL(url);
    const method = init.method ?? 'GET';
    this.calls.push(`${method} ${pathname}`);
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });

    if (pathname === '/user')
      return json(403, { message: 'Resource not accessible by integration' });
    if (method !== 'GET' && this.writeStatus !== 200) return json(this.writeStatus, {});
    const body = init.body ? (JSON.parse(String(init.body)) as { body: string }).body : '';
    if (pathname === '/repos/acme/game/issues/7/comments' && method === 'GET') {
      return json(200, this.comments);
    }
    if (pathname === '/repos/acme/game/issues/7/comments' && method === 'POST') {
      const comment = { id: 100 + this.comments.length, body, user: { login: ACTIONS_BOT } };
      this.comments.push(comment);
      return json(201, comment);
    }
    const edit = /^\/repos\/acme\/game\/issues\/comments\/(\d+)$/.exec(pathname);
    if (edit && method === 'PATCH') {
      const comment = this.comments.find((c) => c.id === Number(edit[1]))!;
      comment.body = body;
      return json(200, comment);
    }
    return json(404, {});
  }) as unknown as typeof fetch;
}

function fakeGateway(report: Report, calls: string[]): AnalysisGateway {
  return {
    verifyKey: async () => {
      calls.push('verify');
      return { plan: 'pro', entitlements: PLAN_CATALOG.pro };
    },
    submitAnalysis: async () => ({ analysisId: report.id, status: 'pending' }),
    getReport: async () => report,
    // The server echoes the key and tries to mention a team: neither may reach GitHub.
    getMarkdown: async () => `# Reporte\n\nNo se filtra ${API_KEY}. Aviso a @acme/security.`,
  };
}

function recordingIo() {
  const log: string[] = [];
  const io: ActionIo & { failed?: string; summary: string[]; outputs: Record<string, string> } = {
    summary: [],
    outputs: {},
    setSecret: (secret) => log.push(`secret:${secret === API_KEY}`),
    info: (m) => log.push(`info:${m}`),
    warning: (m) => log.push(`warning:${m}`),
    setFailed: (m) => {
      io.failed = m;
      log.push(`failed:${m}`);
    },
    setOutput: (name, value) => {
      io.outputs[name] = value;
    },
    writeSummary: async (markdown) => void io.summary.push(markdown),
  };
  return { io, log };
}

function env(overrides: Record<string, string> = {}) {
  return {
    GITHUB_WORKSPACE: WORKSPACE,
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_EVENT_PATH: PR_EVENT,
    GITHUB_REPOSITORY: 'acme/game',
    GITHUB_API_URL: 'https://api.github.test',
    'INPUT_API-KEY': API_KEY,
    'INPUT_API-URL': 'https://api.gyde.test',
    'INPUT_PROJECT-PATH': 'unity-sample',
    'INPUT_FAIL-ON': 'high',
    'INPUT_INCLUDE-AI': 'true',
    'INPUT_COMMENT-ON-PR': 'true',
    'INPUT_FAIL-ON-DEGRADED': 'false',
    'INPUT_GITHUB-TOKEN': 'ghs_runner_token',
    ...overrides,
  };
}

describe('gyde GitHub Action', () => {
  let github: FakeGitHub;
  let gatewayCalls: string[];

  const runWith = (report: Report, overrides: Record<string, string> = {}) => {
    const { io, log } = recordingIo();
    const done = run(env(overrides), io, {
      createGateway: () => fakeGateway(report, gatewayCalls),
      githubFetch: github.fetch,
      readEventFile: async () => JSON.stringify({ pull_request: { number: 7 } }),
    });
    return done.then(() => ({ io, log }));
  };

  beforeEach(() => {
    github = new FakeGitHub();
    gatewayCalls = [];
  });

  it('keeps a single comment per pull request and never touches somebody else’s', async () => {
    github.comments.push({ id: 1, body: `${COMMENT_MARKER} copied`, user: { login: 'someone' } });

    await runWith(sampleReportReady, { 'INPUT_FAIL-ON': 'none' });
    await runWith(sampleReportReady, { 'INPUT_FAIL-ON': 'none' });

    const ours = github.comments.filter((c) => c.user.login === ACTIONS_BOT);
    expect(ours).toHaveLength(1);
    expect(ours[0]!.body.startsWith(COMMENT_MARKER)).toBe(true);
    expect(github.comments[0]!.body).toBe(`${COMMENT_MARKER} copied`);
    expect(github.calls.filter((c) => c.startsWith('POST'))).toHaveLength(1);
    expect(github.calls.filter((c) => c.startsWith('PATCH'))).toHaveLength(1);
  });

  it('fails at the fail-on severity and only warns on a degraded report unless asked', async () => {
    expect((await runWith(sampleReportReady, { 'INPUT_FAIL-ON': 'high' })).io.failed).toMatch(
      /high/,
    );
    expect((await runWith(sampleReportReady, { 'INPUT_FAIL-ON': 'critical' })).io.failed).toBe(
      undefined,
    );

    const warned = await runWith(sampleReportDegraded, { 'INPUT_FAIL-ON': 'none' });
    expect(warned.io.failed).toBe(undefined);
    expect(warned.log.some((l) => l.startsWith('warning:Resultado degradado'))).toBe(true);
    expect(warned.io.outputs.degraded).toBe('true');

    const strict = await runWith(sampleReportDegraded, {
      'INPUT_FAIL-ON': 'none',
      'INPUT_FAIL-ON-DEGRADED': 'true',
    });
    expect(strict.io.failed).toMatch(/degradado/);
  });

  it('masks the API key first and keeps it, and mentions, out of the comment and summary', async () => {
    const { io, log } = await runWith(sampleReportReady, { 'INPUT_FAIL-ON': 'none' });

    expect(log[0]).toBe('secret:true');
    const published = [github.comments[0]!.body, ...io.summary].join('\n');
    expect(published).not.toContain(API_KEY);
    expect(published).toContain('***');
    expect(published).not.toMatch(/(^|\s)@acme/);
  });

  it('warns instead of failing when the token cannot comment (pull request from a fork)', async () => {
    github.writeStatus = 403;
    const { io, log } = await runWith(sampleReportReady, { 'INPUT_FAIL-ON': 'none' });

    expect(io.failed).toBe(undefined);
    expect(log.some((l) => l.startsWith('warning:No se pudo comentar'))).toBe(true);
    expect(io.summary).toHaveLength(1);
  });

  it('does not call GitHub outside a pull request, and fails clearly without an API key', async () => {
    const push = await runWith(sampleReportReady, {
      'INPUT_FAIL-ON': 'none',
      GITHUB_EVENT_NAME: 'push',
    });
    expect(github.calls).toEqual([]);
    expect(push.io.summary).toHaveLength(1);

    const noKey = await runWith(sampleReportReady, { 'INPUT_API-KEY': '' });
    expect(noKey.io.failed).toMatch(/api-key/);
    // Only the push run reached the gateway: without a key nothing is sent.
    expect(gatewayCalls).toEqual(['verify']);
  });
});
