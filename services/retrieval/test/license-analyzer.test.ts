import type { AnalysisRequest, Dependency } from '@gyde/contracts';
import { sampleAnalysisRequest, sampleLicenseFinding } from '@gyde/contracts/samples';
import { describe, expect, it } from 'vitest';

import { LicenseAnalyzer } from '../src/domain/analyzers/licenses/license-analyzer';
import { sha256Hex } from '../src/infrastructure/sha256-hex';
import { SpdxLicenseExpressionParser } from '../src/infrastructure/spdx-license-expression-parser';

const analyzer = new LicenseAnalyzer(new SpdxLicenseExpressionParser(), sha256Hex);

const dependency = (declaredLicense: string | undefined, overrides: Partial<Dependency> = {}) =>
  ({
    ecosystem: 'nuget',
    name: 'Acme.Lib',
    version: '1.0.0',
    direct: true,
    ...(declaredLicense !== undefined && { declaredLicense }),
    ...overrides,
  }) as Dependency;

const analyze = (...dependencies: Dependency[]) =>
  analyzer.analyze({
    request: { ...sampleAnalysisRequest, dependencies } as AnalysisRequest,
    knowledge: [],
  });

const severities = (license: string) =>
  analyze(dependency(license)).findings.map((finding) => finding.severity);

describe('LicenseAnalyzer', () => {
  it('flags GPL-3.0-only as a copyleft risk for proprietary distribution', () => {
    const [finding] = analyze(
      dependency('GPL-3.0-only', { name: 'Acme.GplToolkit', version: '2.1.0' }),
    ).findings;

    // The same finding the shared sample describes.
    expect(finding).toMatchObject({
      kind: 'license',
      severity: sampleLicenseFinding.severity,
      title: sampleLicenseFinding.title,
      dependency: sampleLicenseFinding.dependency,
      evidence: sampleLicenseFinding.evidence,
      recommendation: sampleLicenseFinding.recommendation,
      deterministic: true,
    });
  });

  describe('SPDX expressions', () => {
    it('MIT OR Apache-2.0 is fine, GPL-3.0-only AND MIT is not', () => {
      expect(severities('MIT OR Apache-2.0')).toEqual([]);
      expect(severities('GPL-3.0-only AND MIT')).toEqual(['medium']);
    });

    it('OR lets the licensee choose the least restrictive alternative', () => {
      expect(severities('GPL-3.0-only OR MIT')).toEqual([]);
      expect(severities('GPL-3.0-only OR LGPL-3.0-only')).toEqual(['low']);
    });

    it('AND stacks the obligations: the most restrictive license counts', () => {
      expect(severities('MIT AND LGPL-2.1-only')).toEqual(['low']);
      expect(severities('LGPL-2.1-only AND GPL-3.0-only')).toEqual(['medium']);
      expect(severities('MIT AND Apache-2.0')).toEqual([]);
    });

    it('honors parentheses', () => {
      expect(severities('(MIT OR GPL-3.0-only) AND BSD-3-Clause')).toEqual([]);
      expect(severities('MIT OR (GPL-3.0-only AND LGPL-3.0-only)')).toEqual([]);
      expect(severities('(MIT AND GPL-3.0-only) OR LGPL-3.0-only')).toEqual(['low']);
    });

    it('softens a copyleft license that has a linking exception by one step', () => {
      expect(severities('GPL-2.0-only WITH Classpath-exception-2.0')).toEqual(['low']);
      expect(severities('LGPL-3.0-only WITH LLVM-exception')).toEqual([]);
      // An exception that is not about linking changes nothing.
      expect(severities('GPL-3.0-only WITH Bison-exception-2.2')).toEqual(['medium']);
    });

    it('understands the "+" (or later) suffix and the deprecated ids', () => {
      expect(severities('GPL-2.0+')).toEqual(['medium']);
      expect(severities('GPL-3.0')).toEqual(['medium']);
    });

    it('reads the operator in lower case too', () => {
      expect(severities('MIT and GPL-3.0-only')).toEqual(['medium']);
    });

    it('names the license that decides, as written, in the evidence', () => {
      const [finding] = analyze(dependency('MIT AND AGPL-3.0-only')).findings;
      expect(finding?.evidence[0]?.summary).toBe('AGPL-3.0-only is a network copyleft license.');
    });
  });

  describe('classes of license', () => {
    it.each([
      ['MIT', []],
      ['Apache-2.0', []],
      ['BSD-3-Clause', []],
      ['Zlib', []],
      ['MPL-2.0', ['low']],
      ['LGPL-2.1-or-later', ['low']],
      ['GPL-2.0-or-later', ['medium']],
      ['EUPL-1.2', ['medium']],
      ['AGPL-3.0-or-later', ['high']],
      ['SSPL-1.0', ['high']],
    ])('%s raises %j', (license, expected) => {
      expect(severities(license)).toEqual(expected);
    });

    it('explains the risk and what to do', () => {
      const [weak] = analyze(dependency('LGPL-3.0-only')).findings;
      expect(weak?.impact).toContain('IL2CPP');
      expect(weak?.recommendation).toContain('replaceable');

      const [network] = analyze(dependency('AGPL-3.0-only')).findings;
      expect(network?.impact).toContain('over a network');
    });
  });

  describe('licenses that cannot be classified', () => {
    it('reports an invalid expression as informational', () => {
      const [finding] = analyze(dependency('MIT License')).findings;
      expect(finding).toMatchObject({
        kind: 'license',
        severity: 'info',
        title: 'Acme.Lib declares a license Gyde cannot classify: MIT License',
      });
      expect(finding?.evidence[0]?.summary).toContain('not a valid SPDX license expression');
    });

    it('reports a valid SPDX license that has no policy as informational', () => {
      const [finding] = analyze(dependency('Artistic-2.0')).findings;
      expect(finding?.severity).toBe('info');
      expect(finding?.evidence[0]?.summary).toContain(
        'valid SPDX expression, but Gyde has no policy',
      );
    });

    it.each([
      'NOASSERTION',
      'Proprietary',
      'LicenseRef-company-eula',
      'SEE LICENSE IN license.txt',
    ])('treats %s as unknown', (license) => {
      expect(severities(license)).toEqual(['info']);
    });

    it('lets a known permissive alternative win over an unknown one', () => {
      expect(severities('MIT OR LicenseRef-x')).toEqual([]);
      expect(severities('MIT AND LicenseRef-x')).toEqual(['info']);
    });
  });

  describe('missing license', () => {
    it('is informational for NuGet packages, whose metadata carries a license', () => {
      const [finding] = analyze(dependency(undefined)).findings;
      expect(finding).toMatchObject({
        severity: 'info',
        title: 'Acme.Lib does not declare a license',
      });
    });

    it('says nothing for UPM packages: their manifests never declare one', () => {
      expect(
        analyze(
          dependency(undefined, { ecosystem: 'upm', name: 'com.unity.render-pipelines.universal' }),
        ).findings,
      ).toEqual([]);
    });

    it('treats a blank license as missing', () => {
      expect(analyze(dependency('   ')).findings.map((f) => f.title)).toEqual([
        'Acme.Lib does not declare a license',
      ]);
    });
  });

  describe('incompatible combinations', () => {
    it('flags a pair that cannot be satisfied at once when joined with AND', () => {
      const [finding] = analyze(dependency('GPL-2.0-only AND Apache-2.0')).findings;
      expect(finding).toMatchObject({ severity: 'high' });
      expect(finding?.title).toBe(
        'Acme.Lib requires licenses that cannot be satisfied together: gpl-2.0-only and apache-2.0',
      );
    });

    it('does not flag the same pair when the licensee can choose (OR)', () => {
      expect(severities('GPL-2.0-only OR Apache-2.0')).toEqual([]);
    });
  });

  describe('over the sample project', () => {
    it('one finding: Acme.GplToolkit (GPL-3.0-only, medium); MIT and the UPM package raise nothing', () => {
      const { findings } = analyzer.analyze({ request: sampleAnalysisRequest, knowledge: [] });

      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        severity: 'medium',
        dependency: { name: 'Acme.GplToolkit' },
      });
    });
  });

  it('orders by severity, then title, and gives every finding a stable id', () => {
    const { findings } = analyze(
      dependency('MPL-2.0', { name: 'B.Weak' }),
      dependency('AGPL-3.0-only', { name: 'A.Network' }),
      dependency('GPL-3.0-only', { name: 'C.Strong' }),
    );
    expect(findings.map((f) => f.severity)).toEqual(['high', 'medium', 'low']);
    expect(findings.map((f) => f.id)).toEqual([
      'license:nuget:A.Network@1.0.0',
      'license:nuget:C.Strong@1.0.0',
      'license:nuget:B.Weak@1.0.0',
    ]);
  });

  it('is pure: the same input gives the same output', () => {
    const input = { request: sampleAnalysisRequest, knowledge: [] };
    expect(analyzer.analyze(input)).toEqual(analyzer.analyze(input));
  });

  it('keeps ids within the contract limit even for very long package names', () => {
    const [finding] = analyze(
      dependency('GPL-3.0-only', { name: 'Acme.' + 'Long'.repeat(40) }),
    ).findings;
    expect(finding?.id.length).toBeLessThanOrEqual(100);
  });
});
