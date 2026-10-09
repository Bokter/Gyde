import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { AnalysisRequest } from '../src';
import { sampleAnalysisRequest, sampleKnowledgeObject } from '../src/samples';

/**
 * Repository integrity: the synthetic world in /fixtures must stay consistent with the samples of
 * @gyde/contracts, so a sample project yields the same result as the samples promise.
 */
const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'fixtures');
const read = (relative: string) => readFileSync(join(fixtures, relative), 'utf8');
const readJson = (relative: string): unknown => JSON.parse(read(relative));

interface OsvAdvisory {
  id: string;
  affected: { package: { name: string }; ranges: { events: Record<string, string>[] }[] }[];
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

describe('fixtures stay consistent with the contracts', () => {
  it('the expected parse of unity-sample is a valid request and matches the sample dependencies', () => {
    const expected = readJson('projects/unity-sample/expected-parse.json') as {
      project: unknown;
      dependencies: unknown[];
    };

    const request = AnalysisRequest.parse({
      client: sampleAnalysisRequest.client,
      project: expected.project,
      dependencies: expected.dependencies,
    });

    expect([...request.dependencies].sort(byName)).toEqual(
      [...sampleAnalysisRequest.dependencies].sort(byName),
    );
    expect(request.project.gameEngineVersion).toBe('2022.3.20f1');
  });

  it('the OSV advisory SAMPLE-0001 describes the same affected range as the sample knowledge object', () => {
    const osv = readJson('sources/osv/SAMPLE-0001.json') as OsvAdvisory;
    const sample = sampleKnowledgeObject.affected[0];

    expect(osv.affected[0]?.package.name).toBe(sample?.name);
    expect(osv.affected[0]?.ranges[0]?.events).toEqual([
      { introduced: sample?.introduced },
      { fixed: sample?.fixed },
    ]);
  });

  it('keeps the no-false-positive advisories honest', () => {
    const other = readJson('sources/osv/SAMPLE-0002.json') as OsvAdvisory;
    const regression = readJson('sources/osv/SAMPLE-0003.json') as OsvAdvisory;

    // another package altogether
    expect(other.affected[0]?.package.name).toBe('Acme.Unrelated');
    // same package, but a range that does not include the 1.4.0 used by the samples
    expect(regression.affected[0]?.package.name).toBe('Acme.Serialization');
    expect(regression.affected[0]?.ranges[0]?.events).toEqual([
      { introduced: '2.0.0' },
      { fixed: '2.1.0' },
    ]);
  });

  it('declares the licenses that the samples rely on in the NuGet specs', () => {
    expect(
      read(
        'projects/unity-sample/Assets/Packages/Acme.Serialization.1.4.0/Acme.Serialization.nuspec',
      ),
    ).toContain('>MIT<');
    expect(
      read('projects/unity-sample/Assets/Packages/Acme.GplToolkit.2.1.0/Acme.GplToolkit.nuspec'),
    ).toContain('>GPL-3.0-only<');
  });

  it('keeps the privacy marker in the proprietary script and nowhere in the expected output', () => {
    const marker = 'PROPRIETARY_MARKER_DO_NOT_SEND';
    expect(read('projects/unity-sample/Assets/Scripts/Player.cs')).toContain(marker);
    expect(read('projects/unity-sample/expected-parse.json')).not.toContain(marker);
  });

  it('every JSON source fixture parses', () => {
    for (const source of ['osv', 'ghsa', 'nvd', 'community']) {
      for (const file of readdirSync(join(fixtures, 'sources', source))) {
        if (file.endsWith('.json')) {
          expect(() => readJson(`sources/${source}/${file}`)).not.toThrow();
        }
      }
    }
  });
});
