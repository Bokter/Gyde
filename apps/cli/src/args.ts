import { parseArgs } from 'node:util';

import type { FailOn } from '@gyde/analysis-engine';
import type { GameEngine } from '@gyde/contracts';

export const DEFAULT_API_URL = 'http://localhost:4000';
export const DEFAULT_FAIL_ON: FailOn = 'high';
export const DEFAULT_TIMEOUT_SECONDS = 120;

export type OutputFormat = 'text' | 'json' | 'markdown';

export interface AnalyzeArgs {
  command: 'analyze';
  projectPath: string;
  apiUrl: string;
  apiKey: string | undefined;
  failOn: FailOn;
  format: OutputFormat;
  noAi: boolean;
  failOnDegraded: boolean;
  timeoutSeconds: number;
  engine: GameEngine | undefined;
}

export type ParsedCommand = AnalyzeArgs | { command: 'help' } | { command: 'version' };

/** Bad command line. The message is shown to the user; it never contains the API key. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export const USAGE = `Uso: gyde analyze [ruta] [opciones]

Analiza un proyecto de videojuego en tu máquina y consulta la API de Gyde.
Al servidor solo viajan nombres, versiones y licencias de dependencias.

Opciones:
  --api-url <url>        Gateway de Gyde (o GYDE_API_URL; por defecto ${DEFAULT_API_URL})
  --api-key <llave>      API key (o GYDE_API_KEY, preferible: no queda en el historial)
  --engine <motor>       unity | unreal (por defecto se detecta)
  --fail-on <severidad>  critical | high | medium | low | none (por defecto ${DEFAULT_FAIL_ON})
  --format <formato>     text | json | markdown (por defecto text)
  --no-ai                No pedir la explicación de IA
  --fail-on-degraded     Salir con 3 si el resultado es degradado y no hay hallazgos graves
  --timeout <segundos>   Espera máxima del análisis (por defecto ${DEFAULT_TIMEOUT_SECONDS})
  -h, --help             Muestra esta ayuda
  -v, --version          Muestra la versión

Códigos de salida: 0 limpio · 1 hallazgos >= --fail-on · 2 uso o error · 3 degradado (--fail-on-degraded)
`;

const FAIL_ON_VALUES = ['critical', 'high', 'medium', 'low', 'none'] as const;
const FORMAT_VALUES = ['text', 'json', 'markdown'] as const;
const ENGINE_VALUES = ['unity', 'unreal'] as const;

function oneOf<T extends string>(flag: string, value: string, allowed: readonly T[]): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new UsageError(`Valor no válido para ${flag}: usa ${allowed.join(' | ')}.`);
}

/** Reads argv (without node and the script) and the environment into a typed command. */
export function parseCommandLine(
  argv: readonly string[],
  env: Record<string, string | undefined>,
): ParsedCommand {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        'api-url': { type: 'string' },
        'api-key': { type: 'string' },
        engine: { type: 'string' },
        'fail-on': { type: 'string' },
        format: { type: 'string' },
        'no-ai': { type: 'boolean' },
        'fail-on-degraded': { type: 'boolean' },
        timeout: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (error) {
    // node:util messages name the offending flag, never a value we would need to hide.
    throw new UsageError(error instanceof Error ? error.message : 'Argumentos no válidos.');
  }

  const { values, positionals } = parsed;
  if (values.help) return { command: 'help' };
  if (values.version) return { command: 'version' };

  const [command, projectPath = '.', ...extra] = positionals;
  if (command === undefined) throw new UsageError('Falta el comando. Usa "gyde analyze [ruta]".');
  if (command !== 'analyze') {
    throw new UsageError(`Comando desconocido: ${String(command)}. Usa "gyde analyze [ruta]".`);
  }
  if (extra.length > 0) throw new UsageError('Solo se admite una ruta de proyecto.');

  let timeoutSeconds = DEFAULT_TIMEOUT_SECONDS;
  if (values.timeout !== undefined) {
    timeoutSeconds = Number(values.timeout);
    if (!Number.isInteger(timeoutSeconds) || timeoutSeconds <= 0) {
      throw new UsageError('--timeout debe ser un número entero de segundos mayor que 0.');
    }
  }

  return {
    command: 'analyze',
    projectPath,
    apiUrl: values['api-url'] ?? env['GYDE_API_URL'] ?? DEFAULT_API_URL,
    apiKey: values['api-key'] ?? env['GYDE_API_KEY'] ?? undefined,
    failOn:
      values['fail-on'] === undefined
        ? DEFAULT_FAIL_ON
        : oneOf('--fail-on', values['fail-on'], FAIL_ON_VALUES),
    format: values.format === undefined ? 'text' : oneOf('--format', values.format, FORMAT_VALUES),
    noAi: values['no-ai'] ?? false,
    failOnDegraded: values['fail-on-degraded'] ?? false,
    timeoutSeconds,
    engine:
      values.engine === undefined ? undefined : oneOf('--engine', values.engine, ENGINE_VALUES),
  };
}
