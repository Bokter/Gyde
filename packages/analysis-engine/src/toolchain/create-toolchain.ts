import type { GameEngine } from '@gyde/contracts';

import type { AnalysisGateway } from '../types';

import type { AnalysisToolchainFactory } from './ports';
import { UnityToolchainFactory } from './unity/unity-toolchain.factory';
import { UnrealToolchainFactory } from './unreal/unreal-toolchain.factory';

export interface ToolchainOptions {
  projectRoot: string;
  gateway: AnalysisGateway;
}

/**
 * The single place that knows which concrete factory serves which game engine. The pipeline
 * receives the factory already built and never branches on the engine (`if engine == "Unity"`).
 */
export function createToolchainFactory(
  gameEngine: GameEngine,
  options: ToolchainOptions,
): AnalysisToolchainFactory {
  switch (gameEngine) {
    case 'unity':
      return new UnityToolchainFactory(options);
    case 'unreal':
      return new UnrealToolchainFactory(options);
    default: {
      const unsupported: never = gameEngine;
      throw new Error(`Unsupported game engine: ${String(unsupported)}`);
    }
  }
}

/**
 * Detects the game engine of a project folder (ProjectSettings/ProjectVersion.txt -> unity,
 * *.uproject -> unreal).
 *
 * TODO(area-4): implement.
 */
export async function detectGameEngine(_projectRoot: string): Promise<GameEngine> {
  throw new Error('TODO(area-4): detectGameEngine is not implemented yet');
}
