import { resolve } from 'node:path';

import {
  AnalysisWaitError,
  GameEngineDetectionError,
  GydeApiClient,
  GydeApiError,
  LocalCLIPipeline,
  clean,
  cleanMultiline,
  createToolchainFactory,
  detectGameEngine,
  exitCodeForReport,
  type AnalysisGateway,
} from '@gyde/analysis-engine';

import { USAGE, UsageError, parseCommandLine, type AnalyzeArgs } from './args';
import pkg from '../package.json';

export const EXIT = { ok: 0, findings: 1, error: 2, degraded: 3 } as const;

/** Where the CLI writes. Injected so tests capture the output instead of using the terminal. */
export interface RunIo {
  stdout(text: string): void;
  stderr(text: string): void;
}

export interface RunDeps {
  /** Injectable for tests; defaults to the real HTTP client. */
  createGateway?: (options: { apiUrl: string; apiKey: string }) => AnalysisGateway;
}

/**
 * Runs the CLI and returns the exit code; it never calls `process.exit` nor reads `process`
 * itself, so it can be imported and tested. Everything that reaches stdout or stderr passes
 * through `safe`, which strips control characters and the API key.
 */
export async function run(
  argv: readonly string[],
  env: Record<string, string | undefined>,
  io: RunIo,
  deps: RunDeps = {},
): Promise<number> {
  let apiKey: string | undefined;
  const safe = (text: string, multiline = false): string => {
    const cleaned = multiline ? cleanMultiline(text) : clean(text);
    return apiKey ? cleaned.split(apiKey).join('***') : cleaned;
  };
  const out = (text: string) => io.stdout(text.endsWith('\n') ? text : `${text}\n`);
  const fail = (...lines: string[]) => {
    io.stderr(`${lines.map((line) => safe(line)).join('\n')}\n`);
    return EXIT.error;
  };

  try {
    const command = parseCommandLine(argv, env);
    if (command.command === 'help') {
      out(USAGE);
      return EXIT.ok;
    }
    if (command.command === 'version') {
      out(pkg.version);
      return EXIT.ok;
    }

    apiKey = command.apiKey;
    if (!apiKey) {
      return fail(
        'Error: falta la API key.',
        'Define GYDE_API_KEY (preferible) o pasa --api-key <llave>.',
      );
    }
    return await analyze(command, apiKey, { ...deps, out, safe });
  } catch (error) {
    if (error instanceof UsageError) return fail(`Error: ${error.message}`, 'Usa gyde --help.');
    if (error instanceof GydeApiError) {
      return fail(`Error: ${error.message}`, ...(error.hint ? [error.hint] : []));
    }
    if (error instanceof AnalysisWaitError || error instanceof GameEngineDetectionError) {
      return fail(`Error: ${error.message}`);
    }
    return fail(`Error inesperado: ${error instanceof Error ? error.message : 'sin detalles'}`);
  }
}

async function analyze(
  args: AnalyzeArgs,
  apiKey: string,
  helpers: RunDeps & {
    out: (text: string) => void;
    safe: (text: string, multiline?: boolean) => string;
  },
): Promise<number> {
  const { out, safe } = helpers;
  const projectRoot = resolve(args.projectPath);
  const engine = args.engine ?? (await detectGameEngine(projectRoot));

  const gateway = (helpers.createGateway ?? ((o) => new GydeApiClient(o)))({
    apiUrl: args.apiUrl,
    apiKey,
  });
  const wait = { timeoutMs: args.timeoutSeconds * 1000 };

  const pipeline = new LocalCLIPipeline({
    gateway,
    toolchain: createToolchainFactory(engine, { projectRoot, gateway, wait }),
    projectRoot,
    clientVersion: pkg.version,
    includeAi: !args.noAi,
    wait,
    // Only the text format is printed by the pipeline; json and markdown are printed below.
    output: args.format === 'text' ? (text) => out(safe(text, true)) : undefined,
  });
  const report = await pipeline.runAnalysis();

  if (args.format === 'json') out(safe(JSON.stringify(report, null, 2), true));
  if (args.format === 'markdown') out(safe(await gateway.getMarkdown(report.id), true));

  const findingsExit = exitCodeForReport(report, args.failOn);
  if (findingsExit !== 0) return EXIT.findings;
  return args.failOnDegraded && report.degraded ? EXIT.degraded : EXIT.ok;
}
