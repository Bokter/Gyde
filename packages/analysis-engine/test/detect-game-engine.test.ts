import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { GameEngineDetectionError, detectGameEngine } from '../src';

const PROJECTS = resolve(import.meta.dirname, '../../../fixtures/projects');

describe('detectGameEngine', () => {
  const created: string[] = [];

  async function tempProject(files: Record<string, string> = {}): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'gyde-detect-'));
    created.push(root);
    for (const [name, content] of Object.entries(files)) {
      const target = join(root, name);
      await mkdir(join(target, '..'), { recursive: true });
      await writeFile(target, content);
    }
    return root;
  }

  afterEach(async () => {
    await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('tells the Unity and Unreal sample projects apart', async () => {
    await expect(detectGameEngine(join(PROJECTS, 'unity-sample'))).resolves.toBe('unity');
    await expect(detectGameEngine(join(PROJECTS, 'unreal-sample'))).resolves.toBe('unreal');
  });

  it('accepts either Unity marker on its own', async () => {
    const onlyVersion = await tempProject({ 'ProjectSettings/ProjectVersion.txt': 'x' });
    const onlyManifest = await tempProject({ 'Packages/manifest.json': '{}' });

    await expect(detectGameEngine(onlyVersion)).resolves.toBe('unity');
    await expect(detectGameEngine(onlyManifest)).resolves.toBe('unity');
  });

  it('says what it looked for when nothing matches', async () => {
    const error = await detectGameEngine(await tempProject()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GameEngineDetectionError);
    expect((error as GameEngineDetectionError).reason).toBe('not-detected');
    expect((error as Error).message).toContain('ProjectSettings/ProjectVersion.txt');
    expect((error as Error).message).toContain('Packages/manifest.json');
    expect((error as Error).message).toContain('*.uproject');
  });

  it('refuses to guess when both engines match and suggests --engine', async () => {
    const root = await tempProject({
      'Packages/manifest.json': '{}',
      'Game.uproject': '{}',
    });
    const error = await detectGameEngine(root).catch((e: unknown) => e);

    expect((error as GameEngineDetectionError).reason).toBe('ambiguous');
    expect((error as Error).message).toContain('--engine unity');
    expect((error as Error).message).toContain('--engine unreal');
  });

  it('reports a folder that does not exist', async () => {
    const error = await detectGameEngine(join(PROJECTS, 'nope')).catch((e: unknown) => e);

    expect((error as GameEngineDetectionError).reason).toBe('not-found');
  });
});
