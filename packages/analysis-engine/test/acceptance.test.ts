import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CsharpDependencyParser } from '../src';

const UNITY_SAMPLE = resolve(import.meta.dirname, '../../../fixtures/projects/unity-sample');
const EXPECTED_PARSE = resolve(UNITY_SAMPLE, 'expected-parse.json');

/**
 * Executable acceptance criteria for the Area 4 work in this package. Turn each `it.todo` into a
 * real test as you implement it. Use the samples of @gyde/contracts and fixtures/ for data.
 */
describe('parsers (use fixtures/projects)', () => {
  const parser = new CsharpDependencyParser(UNITY_SAMPLE);

  it('CsharpDependencyParser reads UPM packages from Packages/manifest.json', async () => {
    const result = await parser.parseDependencies();
    const upm = result.dependencies.filter((d) => d.ecosystem === 'upm');
    expect(upm).toEqual([
      {
        ecosystem: 'upm',
        name: 'com.unity.render-pipelines.universal',
        version: '14.0.9',
        direct: true,
      },
    ]);
  });

  it('CsharpDependencyParser reads NuGet packages from .csproj / packages.config', async () => {
    const result = await parser.parseDependencies();
    const nuget = result.dependencies.filter((d) => d.ecosystem === 'nuget');
    expect(nuget).toEqual([
      {
        ecosystem: 'nuget',
        name: 'Acme.GplToolkit',
        version: '2.1.0',
        declaredLicense: 'GPL-3.0-only',
        direct: true,
      },
      {
        ecosystem: 'nuget',
        name: 'Acme.Serialization',
        version: '1.4.0',
        declaredLicense: 'MIT',
        direct: true,
      },
    ]);
  });

  it('CsharpDependencyParser reads the editor version from ProjectVersion.txt', async () => {
    const result = await parser.parseDependencies();
    expect(result.project.gameEngine).toBe('unity');
    expect(result.project.gameEngineVersion).toBe('2022.3.20f1');
  });

  it('CsharpDependencyParser output matches expected-parse.json exactly', async () => {
    const result = await parser.parseDependencies();
    const expected = JSON.parse(readFileSync(EXPECTED_PARSE, 'utf-8'));
    expect(result).toEqual(expected);
  });

  it('CppDependencyParser reads plugins from the .uproject and modules from *.Build.cs', () => {});
  it('CppDependencyParser reads vcpkg.json / conanfile.txt when present', () => {});
  it('detectGameEngine tells a Unity project from an Unreal one and fails clearly otherwise', () => {});
  it('parsers never read or return source code, only names, versions and licenses', async () => {
    const result = await parser.parseDependencies();
    const wire = JSON.stringify(result);
    expect(wire).not.toContain('PROPRIETARY_MARKER_DO_NOT_SEND');
    expect(wire).not.toContain('Assets/Scripts');
    expect(wire).not.toContain('Player.cs');
    expect(wire).not.toContain('transform.Translate');
  });
});

describe('pipeline steps still to implement', () => {
  it.todo('analyzeLicenses returns the license findings once the deterministic stage is ready');
  it.todo('generateReport polls until the report is ready, with a timeout');
  it.todo('generateReport raises a clear error when the report ends as failed');
  it.todo('LocalCLIPipeline prints a readable, severity-ordered report and sets the exit code');
  it.todo('GitHubActionPipeline posts the report as a pull request comment');
});

describe('GydeApiClient', () => {
  it.todo('sends the API key as a Bearer token and never logs it');
  it.todo('validates every response with the @gyde/contracts schemas');
  it.todo('goes through the Circuit Breaker and serves the cached report as degraded when open');
  it.todo('maps 401/402/429 to errors the user can act on (invalid key, plan limit, rate limit)');
});
