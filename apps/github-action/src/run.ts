import {
  AnalysisWaitError,
  GameEngineDetectionError,
  GydeApiClient,
  GydeApiError,
  createToolchainFactory,
  detectGameEngine,
  exitCodeForReport,
  type AnalysisGateway,
} from '@gyde/analysis-engine';
import type { Report } from '@gyde/contracts';

import { buildCommentBody, sanitizeReport } from './comment-body';
import { GitHubApiError, GitHubComments } from './github-comments';
import { InputError, readInputs, type ActionInputs } from './inputs';
import { PullRequestCommentPipeline } from './pull-request-comment.pipeline';
import { pullRequestFromEnv, type PullRequestRef } from './pull-request';
import pkg from '../package.json';

/** What the action does on the runner. `main.ts` wires it to `@actions/core`; tests capture it. */
export interface ActionIo {
  setSecret(secret: string): void;
  info(message: string): void;
  warning(message: string): void;
  setFailed(message: string): void;
  setOutput(name: string, value: string): void;
  /** Appends Markdown to the job summary (the run's Summary tab). */
  writeSummary(markdown: string): Promise<void>;
}

export interface RunDeps {
  /** Injectable for tests; defaults to the real HTTP client of the engine. */
  createGateway?: (options: { apiUrl: string; apiKey: string }) => AnalysisGateway;
  /** Injectable for tests; defaults to the global fetch (GitHub REST API). */
  githubFetch?: typeof fetch;
  readEventFile?: (path: string) => Promise<string>;
}

type Env = Record<string, string | undefined>;

/**
 * Runs the action and never throws: every outcome ends as log lines, outputs and, when the step
 * must fail, `setFailed`. The API key is registered as a secret before anything else, so the
 * runner masks it in every log line.
 */
export async function run(env: Env, io: ActionIo, deps: RunDeps = {}): Promise<void> {
  const rawKey = (env['INPUT_API-KEY'] ?? '').trim();
  if (rawKey) io.setSecret(rawKey);
  const redact = (text: string) => (rawKey ? text.split(rawKey).join('***') : text);

  try {
    const inputs = readInputs(env);
    const pr = inputs.commentOnPr ? await pullRequestFromEnv(env, deps.readEventFile) : null;
    const report = await analyze(inputs, env, io, deps, pr);

    io.setOutput('analysis-id', report.id);
    io.setOutput('risk-score', report.summary.riskScore?.toString() ?? '');
    io.setOutput('degraded', String(report.degraded));

    if (exitCodeForReport(report, inputs.failOn) !== 0) {
      io.setFailed(`Gyde encontró hallazgos de severidad ${inputs.failOn} o mayor.`);
    } else if (report.degraded) {
      const message =
        'Resultado degradado: falta la explicación de IA; los hallazgos siguen siendo válidos.';
      if (inputs.failOnDegraded) io.setFailed(message);
      else io.warning(message);
    }
  } catch (error) {
    io.setFailed(redact(failureMessage(error)));
  }
}

async function analyze(
  inputs: ActionInputs,
  env: Env,
  io: ActionIo,
  deps: RunDeps,
  pr: PullRequestRef | null,
): Promise<Report> {
  const engine = await detectGameEngine(inputs.projectRoot);
  io.info(`Gyde: proyecto ${engine} en ${inputs.projectRoot}`);

  const gateway = (deps.createGateway ?? ((o) => new GydeApiClient(o)))({
    apiUrl: inputs.apiUrl,
    apiKey: inputs.apiKey,
  });
  const pipeline = new PullRequestCommentPipeline({
    gateway,
    toolchain: createToolchainFactory(engine, { projectRoot: inputs.projectRoot, gateway }),
    workspace: inputs.projectRoot,
    clientVersion: pkg.version,
    includeAi: inputs.includeAi,
    onMarkdownUnavailable: () =>
      io.warning('No se pudo obtener el reporte en Markdown; se publica en texto plano.'),
    publish: (markdown) =>
      publish(sanitizeReport(markdown, inputs.apiKey), inputs, env, io, deps, pr),
  });
  return pipeline.runAnalysis();
}

async function publish(
  report: string,
  inputs: ActionInputs,
  env: Env,
  io: ActionIo,
  deps: RunDeps,
  pr: PullRequestRef | null,
): Promise<void> {
  await io.writeSummary(report);
  if (!inputs.commentOnPr) return;
  if (!pr) {
    io.info('Gyde: no es un pull request; el reporte está en el resumen del job.');
    return;
  }
  if (!inputs.githubToken) {
    io.warning('Sin github-token no se puede comentar el pull request.');
    return;
  }

  const comments = new GitHubComments({
    apiUrl: env.GITHUB_API_URL || 'https://api.github.com',
    token: inputs.githubToken,
    fetch: deps.githubFetch,
  });
  try {
    const outcome = await comments.upsert(pr, buildCommentBody(report));
    io.info(
      `Gyde: comentario ${outcome === 'created' ? 'creado' : 'actualizado'} en #${pr.number}.`,
    );
  } catch (error) {
    // A pull request from a fork gets a read-only token: the report is still in the job summary.
    if (error instanceof GitHubApiError && (error.status === 403 || error.status === 404)) {
      io.warning(
        `No se pudo comentar el pull request (HTTP ${error.status}). Revisa que el workflow tenga "permissions: pull-requests: write"; en los pull requests desde un fork el token es de solo lectura. El reporte está en el resumen del job.`,
      );
      return;
    }
    throw error;
  }
}

function failureMessage(error: unknown): string {
  if (error instanceof InputError) return error.message;
  if (error instanceof GydeApiError) return [error.message, error.hint].filter(Boolean).join(' ');
  if (error instanceof AnalysisWaitError || error instanceof GameEngineDetectionError) {
    return error.message;
  }
  if (error instanceof GitHubApiError) return error.message;
  return `Error inesperado: ${error instanceof Error ? error.message : 'sin detalles'}`;
}
