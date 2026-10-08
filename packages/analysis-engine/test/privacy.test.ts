import { AnalysisRequest } from '@gyde/contracts';
import { sampleAnalysisRequest } from '@gyde/contracts/samples';
import { describe, expect, it } from 'vitest';

import { buildAnalysisRequest, type ParsedProject } from '../src';

describe('buildAnalysisRequest (privacy gate)', () => {
  const parsed: ParsedProject = {
    project: sampleAnalysisRequest.project,
    dependencies: sampleAnalysisRequest.dependencies,
  };

  it('builds a valid request from parsed data', () => {
    const request = buildAnalysisRequest({ parsed, client: sampleAnalysisRequest.client });
    expect(AnalysisRequest.safeParse(request).success).toBe(true);
    expect(request.dependencies).toHaveLength(sampleAnalysisRequest.dependencies.length);
  });

  it('drops anything a parser attached by mistake (paths, snippets) instead of sending it', () => {
    const dirty = {
      project: { ...parsed.project, rootPath: 'C:/games/secret-game' },
      dependencies: parsed.dependencies.map((dependency) => ({
        ...dependency,
        path: 'Assets/Plugins/Acme.dll',
        snippet: 'class Player { /* proprietary */ }',
      })),
    } as unknown as ParsedProject;

    const request = buildAnalysisRequest({ parsed: dirty, client: sampleAnalysisRequest.client });
    const wire = JSON.stringify(request);

    expect(wire).not.toContain('secret-game');
    expect(wire).not.toContain('Assets/Plugins');
    expect(wire).not.toContain('proprietary');
    expect(AnalysisRequest.safeParse(request).success).toBe(true);
  });

  it('omits the license when the package declares none and honors includeAi', () => {
    const request = buildAnalysisRequest({
      parsed: {
        project: parsed.project,
        dependencies: [
          { ecosystem: 'upm', name: 'com.unity.mathematics', version: '1.3.1', direct: true },
        ],
      },
      client: sampleAnalysisRequest.client,
      options: { includeAi: false },
    });

    expect(request.dependencies[0]).not.toHaveProperty('declaredLicense');
    expect(request.options.includeAi).toBe(false);
  });
});
