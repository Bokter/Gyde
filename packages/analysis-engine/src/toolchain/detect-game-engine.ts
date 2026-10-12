import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { GameEngine } from '@gyde/contracts';

/** Why the engine could not be decided. The message is meant to be shown to the user as is. */
export class GameEngineDetectionError extends Error {
  readonly reason: 'not-found' | 'not-detected' | 'ambiguous';

  constructor(reason: GameEngineDetectionError['reason'], message: string) {
    super(message);
    this.name = 'GameEngineDetectionError';
    this.reason = reason;
  }
}

const UNITY_MARKERS = ['ProjectSettings/ProjectVersion.txt', 'Packages/manifest.json'] as const;

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * Detects the game engine of a project folder by looking only at its markers (never at its
 * sources):
 * - Unity: `ProjectSettings/ProjectVersion.txt` or `Packages/manifest.json`.
 * - Unreal: a `*.uproject` file in the root.
 *
 * Throws `GameEngineDetectionError` when the folder does not exist, when nothing matches (the
 * message says what was searched) or when both engines match (the message suggests
 * `--engine unity|unreal`).
 */
export async function detectGameEngine(projectRoot: string): Promise<GameEngine> {
  let entries: string[];
  try {
    entries = await readdir(projectRoot);
  } catch {
    throw new GameEngineDetectionError(
      'not-found',
      `No se pudo leer la carpeta del proyecto: ${projectRoot}`,
    );
  }

  const unityMarkers: string[] = [];
  for (const marker of UNITY_MARKERS) {
    if (await isFile(join(projectRoot, marker))) unityMarkers.push(marker);
  }
  const uprojects = entries.filter((name) => name.toLowerCase().endsWith('.uproject'));

  const isUnity = unityMarkers.length > 0;
  const isUnreal = uprojects.length > 0;

  if (isUnity && isUnreal) {
    throw new GameEngineDetectionError(
      'ambiguous',
      `El proyecto parece de Unity (${unityMarkers.join(', ')}) y de Unreal (${uprojects.join(', ')}). ` +
        'Indica el motor con --engine unity o --engine unreal.',
    );
  }
  if (isUnity) return 'unity';
  if (isUnreal) return 'unreal';

  throw new GameEngineDetectionError(
    'not-detected',
    `No se reconoce el motor del proyecto en ${projectRoot}. Se buscó, para Unity, ` +
      `${UNITY_MARKERS.join(' o ')} y, para Unreal, un archivo *.uproject en la raíz.`,
  );
}
