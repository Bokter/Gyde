import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';

import { AnalysisRequest, PLAN_CATALOG, type Report } from '@gyde/contracts';
import {
  sampleLicenseFinding,
  sampleReportDegraded,
  sampleReportReady,
} from '@gyde/contracts/samples';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { run } from '../src/run';

const UNITY_SAMPLE = resolve(import.meta.dirname, '../../../fixtures/projects/unity-sample');
const API_KEY = 'gyde_test_key_0123456789_do_not_print';

interface FakeGateway {
  url: string;
  authorizations: string[];
  submitted: unknown[];
  /** What the gateway answers; tests change it before running the CLI. */
  report: Report;
  markdown: string;
  failVerifyWith?: { status: number; code: string; message: string };
  close(): Promise<void>;
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/** A real HTTP server that plays the gateway, so the CLI exercises its real client. */
async function startFakeGateway(): Promise<FakeGateway> {
  const state: FakeGateway = {
    url: '',
    authorizations: [],
    submitted: [],
    report: sampleReportReady,
    markdown: '# Informe',
    close: async () => {},
  };
  const server: Server = createServer(async (request, response) => {
    state.authorizations.push(request.headers.authorization ?? '');
    const send = (status: number, body: unknown, type = 'application/json') => {
      response.writeHead(status, { 'content-type': type });
      response.end(typeof body === 'string' ? body : JSON.stringify(body));
    };
    const path = request.url ?? '';
    if (path === '/v1/auth/verify') {
      if (state.failVerifyWith) {
        const { status, code, message } = state.failVerifyWith;
        return send(status, { error: { code, message } });
      }
      return send(200, { plan: 'pro', entitlements: PLAN_CATALOG.pro });
    }
    if (path === '/v1/analyses' && request.method === 'POST') {
      state.submitted.push(JSON.parse(await readBody(request)));
      return send(202, { analysisId: state.report.id, status: 'pending' });
    }
    if (path.endsWith('/markdown')) return send(200, state.markdown, 'text/markdown');
    if (path.startsWith('/v1/analyses/')) return send(200, state.report);
    return send(404, { error: { code: 'not_found', message: 'no such route' } });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  state.close = () => new Promise((done) => server.close(() => done()));
  return state;
}

async function runCli(argv: string[], env: Record<string, string> = {}) {
  let stdout = '';
  let stderr = '';
  const code = await run(argv, env, {
    stdout: (text) => void (stdout += text),
    stderr: (text) => void (stderr += text),
  });
  return { code, stdout, stderr, all: stdout + stderr };
}

describe('gyde analyze', () => {
  let gateway: FakeGateway;
  beforeEach(async () => {
    gateway = await startFakeGateway();
  });
  afterEach(() => gateway.close());

  const analyze = (extra: string[] = [], env: Record<string, string> = {}) =>
    runCli(['analyze', UNITY_SAMPLE, '--api-url', gateway.url, ...extra], {
      GYDE_API_KEY: API_KEY,
      ...env,
    });

  it('analyzes a Unity project: one request with no source, a readable report, exit 1 for a high finding', async () => {
    const result = await analyze();

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('[ALTA]');
    // The report keeps its line structure: one header line, one line per detail.
    const lines = result.stdout.split('\n');
    expect(lines[0]).toMatch(/^Gyde · análisis /);
    expect(lines.some((line) => line.startsWith('[ALTA] Acme.Serialization'))).toBe(true);
    expect(lines.some((line) => line.startsWith('  Recomendación: '))).toBe(true);
    expect(result.stdout).toContain('Acme.Serialization');
    expect(gateway.submitted).toHaveLength(1);
    expect(AnalysisRequest.safeParse(gateway.submitted[0]).success).toBe(true);
    const wire = JSON.stringify(gateway.submitted[0]);
    expect(wire).not.toContain('PROPRIETARY_MARKER_DO_NOT_SEND');
    expect(wire).not.toContain('Player.cs');
    expect(gateway.authorizations.every((value) => value === `Bearer ${API_KEY}`)).toBe(true);
  });

  it('never prints the API key, not even when the server echoes it back', async () => {
    gateway.failVerifyWith = {
      status: 401,
      code: 'unauthorized',
      message: `The key ${API_KEY} is not valid`,
    };
    const result = await analyze();

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('GYDE_API_KEY');
    expect(result.all).not.toContain(API_KEY);
    expect(result.stderr).toContain('***');
    expect(result.stderr).not.toMatch(/\n\s+at /); // no stack trace

    const viaFlag = await runCli([
      'analyze',
      UNITY_SAMPLE,
      '--api-url',
      gateway.url,
      '--api-key',
      API_KEY,
    ]);
    expect(viaFlag.all).not.toContain(API_KEY);
  });

  it('decides the exit code from --fail-on', async () => {
    expect((await analyze(['--fail-on', 'high'])).code).toBe(1);
    expect((await analyze(['--fail-on', 'critical'])).code).toBe(0);
    expect((await analyze(['--fail-on', 'none'])).code).toBe(0);
  });

  it('exits 3 for a degraded report only with --fail-on-degraded, and findings win over it', async () => {
    gateway.report = { ...sampleReportDegraded, findings: [sampleLicenseFinding] };
    const lenient = await analyze();
    expect(lenient.code).toBe(0);
    expect(lenient.stdout).toContain('Resultado degradado');
    expect((await analyze(['--fail-on-degraded'])).code).toBe(3);

    gateway.report = sampleReportDegraded; // has a high finding
    expect((await analyze(['--fail-on-degraded'])).code).toBe(1);
  });

  it('prints the backend Markdown with --format markdown, stripped of control characters', async () => {
    gateway.markdown = '# Informe\n\n- hallazgo\u001b[2J\u001b]0;pwned\u0007\n';
    const result = await analyze(['--format', 'markdown']);

    expect(result.stdout).toBe('# Informe\n\n- hallazgo[2J]0;pwned\n');
    expect(result.code).toBe(1);
  });

  it('prints the report as JSON with --format json and honors --no-ai', async () => {
    const result = await analyze(['--format', 'json', '--no-ai']);

    expect((JSON.parse(result.stdout) as Report).id).toBe(sampleReportReady.id);
    expect(gateway.submitted[0]).toMatchObject({ options: { includeAi: false } });
  });

  it('reads the API key from GYDE_API_KEY and reports a missing one with exit 2', async () => {
    const missing = await runCli(['analyze', UNITY_SAMPLE, '--api-url', gateway.url]);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain('GYDE_API_KEY');
    expect(gateway.authorizations).toHaveLength(0);
  });

  it.each([
    [['analyze', UNITY_SAMPLE, '--fail-on', 'nope'], '--fail-on'],
    [['analyze', UNITY_SAMPLE, '--format', 'pdf'], '--format'],
    [['analyze', UNITY_SAMPLE, '--timeout', '0'], '--timeout'],
    [['analyze', UNITY_SAMPLE, '--engine', 'godot'], '--engine'],
    [['analyze', UNITY_SAMPLE, '--bogus'], '--bogus'],
    [['deploy'], 'deploy'],
    [[], 'comando'],
  ])('rejects bad usage %j with exit 2 and a readable message', async (argv, mention) => {
    const result = await runCli(argv, { GYDE_API_KEY: API_KEY });

    expect(result.code).toBe(2);
    expect(result.stderr).toContain(mention);
    expect(result.stdout).toBe('');
  });

  it('explains an unrecognizable project, saying what was searched, without a stack trace', async () => {
    const result = await runCli(
      ['analyze', resolve(UNITY_SAMPLE, 'Assets'), '--api-url', gateway.url],
      {
        GYDE_API_KEY: API_KEY,
      },
    );

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('ProjectSettings/ProjectVersion.txt');
    expect(result.stderr).not.toMatch(/\n\s+at /);
  });
});
