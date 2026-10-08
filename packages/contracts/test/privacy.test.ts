import { describe, expect, it } from 'vitest';

import { AnalysisRequest } from '../src';
import { sampleAnalysisRequest } from '../src/samples';

/**
 * PRIVACY INVARIANT: the source code of a customer never leaves its environment.
 * If one of these tests starts failing because the schema became more permissive,
 * stop and review the change with the whole team.
 */
describe('AnalysisRequest privacy invariant', () => {
  it('accepts names, versions, licenses and technical context only', () => {
    expect(AnalysisRequest.safeParse(sampleAnalysisRequest).success).toBe(true);
  });

  const [firstDependency] = sampleAnalysisRequest.dependencies;

  it.each([
    ['source code at the top level', { ...sampleAnalysisRequest, source: 'class Player {}' }],
    ['a list of files', { ...sampleAnalysisRequest, files: ['Assets/Scripts/Player.cs'] }],
    [
      'the repository url',
      { ...sampleAnalysisRequest, repository: 'https://github.com/acme/secret-game' },
    ],
    [
      'a local path inside the project context',
      {
        ...sampleAnalysisRequest,
        project: { ...sampleAnalysisRequest.project, rootPath: 'C:/games/secret-game' },
      },
    ],
    [
      'a file path inside a dependency',
      {
        ...sampleAnalysisRequest,
        dependencies: [{ ...firstDependency, path: 'Assets/Plugins/Acme.dll' }],
      },
    ],
    [
      'extra client metadata',
      { ...sampleAnalysisRequest, client: { ...sampleAnalysisRequest.client, hostname: 'dev-pc' } },
    ],
  ])('rejects %s', (_label, payload) => {
    expect(AnalysisRequest.safeParse(payload).success).toBe(false);
  });

  it('fills defaults without letting unknown fields through', () => {
    const parsed = AnalysisRequest.parse({
      client: { kind: 'github-action', version: '0.1.0' },
      project: { gameEngine: 'unreal', gameEngineVersion: '5.3.2' },
      dependencies: [{ ecosystem: 'unreal', name: 'Niagara', version: '5.3.2' }],
    });
    expect(parsed.options.includeAi).toBe(true);
    expect(parsed.project.platforms).toEqual([]);
    expect(parsed.dependencies[0]?.direct).toBe(true);
  });
});
