import { isAbsolute, relative, resolve } from 'node:path';

import type { FailOn } from '@gyde/analysis-engine';
import { Severity } from '@gyde/contracts';

/** The inputs of action.yml, validated. */
export interface ActionInputs {
  apiKey: string;
  apiUrl: string;
  /** Absolute path of the game project, always inside `GITHUB_WORKSPACE`. */
  projectRoot: string;
  failOn: FailOn;
  failOnDegraded: boolean;
  includeAi: boolean;
  commentOnPr: boolean;
  githubToken: string;
}

/** A wrong input: the message says which one and what is expected. Never carries a secret. */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputError';
  }
}

type Env = Record<string, string | undefined>;

/** Same variable name the runner uses: `INPUT_` + the name in upper case, spaces as `_`. */
function input(env: Env, name: string): string {
  return (env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] ?? '').trim();
}

/** The YAML 1.2 booleans, as `core.getBooleanInput` accepts them. */
function booleanInput(env: Env, name: string, fallback: boolean): boolean {
  const value = input(env, name);
  if (value === '') return fallback;
  if (['true', 'True', 'TRUE'].includes(value)) return true;
  if (['false', 'False', 'FALSE'].includes(value)) return false;
  throw new InputError(`La entrada "${name}" debe ser true o false.`);
}

export function readInputs(env: Env): ActionInputs {
  const apiKey = input(env, 'api-key');
  if (!apiKey) {
    throw new InputError(
      'Falta la entrada "api-key". Guárdala como secreto del repositorio (GYDE_API_KEY) y pásala con api-key: ${{ secrets.GYDE_API_KEY }}. En los pull requests desde un fork GitHub no entrega los secretos.',
    );
  }

  const apiUrl = input(env, 'api-url');
  let url: URL;
  try {
    url = new URL(apiUrl);
  } catch {
    throw new InputError('La entrada "api-url" debe ser una URL http(s).');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new InputError('La entrada "api-url" debe ser una URL http(s).');
  }

  const workspace = resolve(env.GITHUB_WORKSPACE ?? process.cwd());
  const projectRoot = resolve(workspace, input(env, 'project-path') || '.');
  const inside = relative(workspace, projectRoot);
  if (inside.startsWith('..') || isAbsolute(inside)) {
    throw new InputError('La entrada "project-path" debe estar dentro del workspace del runner.');
  }

  const failOn = input(env, 'fail-on') || 'high';
  if (failOn !== 'none' && !Severity.safeParse(failOn).success) {
    throw new InputError('La entrada "fail-on" debe ser critical, high, medium, low, info o none.');
  }

  return {
    apiKey,
    apiUrl,
    projectRoot,
    failOn: failOn as FailOn,
    failOnDegraded: booleanInput(env, 'fail-on-degraded', false),
    includeAi: booleanInput(env, 'include-ai', true),
    commentOnPr: booleanInput(env, 'comment-on-pr', true),
    githubToken: input(env, 'github-token'),
  };
}
