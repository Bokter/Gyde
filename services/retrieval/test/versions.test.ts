import type { AffectedRange, Ecosystem } from '@gyde/contracts';
import { describe, expect, it } from 'vitest';

import { isVersionAffected } from '../src/domain/versions/affected-range';
import { compareVersions, parseVersion } from '../src/domain/versions/version';

function compare(ecosystem: Ecosystem, a: string, b: string): number | undefined {
  const left = parseVersion(ecosystem, a);
  const right = parseVersion(ecosystem, b);
  return left && right ? compareVersions(left, right) : undefined;
}

describe('parseVersion', () => {
  it.each([
    ['nuget', '1'],
    ['nuget', '1.2'],
    ['nuget', '1.2.3'],
    ['nuget', '1.2.3.4'],
    ['nuget', '1.2.3-beta.1'],
    ['nuget', '1.2.3+build.5'],
    ['nuget', 'v1.2.3'],
    ['upm', '14.0.9'],
    ['upm', '1.0.0-preview.2'],
    ['unreal', '5.3.2'],
    ['cpp', '1.2.11'],
  ] as const)('parses %s %s', (ecosystem, text) => {
    expect(parseVersion(ecosystem, text)).toBeDefined();
  });

  it.each([
    ['nuget', ''],
    ['nuget', 'latest'],
    ['nuget', '1.2.3.4.5'],
    ['nuget', '[1.0,2.0)'],
    ['nuget', '1.*'],
    ['nuget', '1.2.3-'],
    ['nuget', '1..2'],
    ['upm', '1.2.3.4'], // UPM is SemVer: three parts
  ] as const)('refuses %s "%s"', (ecosystem, text) => {
    expect(parseVersion(ecosystem, text)).toBeUndefined();
  });
});

describe('compareVersions', () => {
  it('compares numbers, not text: 1.10.0 is higher than 1.9.0', () => {
    expect(compare('nuget', '1.10.0', '1.9.0')).toBe(1);
    expect(compare('nuget', '1.9.0', '1.10.0')).toBe(-1);
    expect(compare('upm', '10.0.0', '9.9.9')).toBe(1);
  });

  it('treats missing parts as zero: 1.4 = 1.4.0 = 1.4.0.0', () => {
    expect(compare('nuget', '1.4', '1.4.0')).toBe(0);
    expect(compare('nuget', '1.4.0', '1.4.0.0')).toBe(0);
    expect(compare('nuget', '1', '1.0.0.0')).toBe(0);
  });

  it('uses the fourth NuGet part', () => {
    expect(compare('nuget', '1.2.3.4', '1.2.3.5')).toBe(-1);
    expect(compare('nuget', '1.2.3.1', '1.2.3')).toBe(1);
  });

  it('ignores leading zeros and a leading v', () => {
    expect(compare('nuget', '01.02.003', '1.2.3')).toBe(0);
    expect(compare('nuget', 'v1.2.3', '1.2.3')).toBe(0);
  });

  it('keeps very large numbers exact', () => {
    expect(compare('nuget', '1.9007199254740993', '1.9007199254740992')).toBe(1);
  });

  it('ignores build metadata', () => {
    expect(compare('nuget', '1.2.3+a', '1.2.3+b')).toBe(0);
  });

  describe('pre-releases', () => {
    it('sort before their release', () => {
      expect(compare('nuget', '1.5.0-beta', '1.5.0')).toBe(-1);
      expect(compare('upm', '1.5.0', '1.5.0-preview.1')).toBe(1);
    });

    it('follow the SemVer 2.0 precedence example', () => {
      const ordered = [
        '1.0.0-alpha',
        '1.0.0-alpha.1',
        '1.0.0-alpha.beta',
        '1.0.0-beta',
        '1.0.0-beta.2',
        '1.0.0-beta.11',
        '1.0.0-rc.1',
        '1.0.0',
      ];
      for (let i = 0; i < ordered.length - 1; i++) {
        expect(
          compare('upm', ordered[i]!, ordered[i + 1]!),
          `${ordered[i]} < ${ordered[i + 1]}`,
        ).toBe(-1);
        expect(compare('upm', ordered[i + 1]!, ordered[i]!)).toBe(1);
      }
    });

    it('compare identifiers without regard to case, numbers below text', () => {
      expect(compare('nuget', '1.0.0-BETA', '1.0.0-beta')).toBe(0);
      expect(compare('nuget', '1.0.0-1', '1.0.0-a')).toBe(-1);
    });

    it('sort by their numbers first: 1.5.0-beta is above 1.4.9', () => {
      expect(compare('nuget', '1.5.0-beta', '1.4.9')).toBe(1);
    });
  });

  it('is a consistent order: antisymmetric and transitive over a sample', () => {
    const sample = [
      '0.9',
      '1.0.0-rc.1',
      '1.0.0',
      '1.0.0.1',
      '1.0.1',
      '1.10',
      '2.0.0-beta',
      '2.0.0',
    ];
    for (const a of sample) {
      expect(compare('nuget', a, a)).toBe(0);
      for (const b of sample) {
        expect(compare('nuget', a, b)).toBe(-(compare('nuget', b, a) ?? 0) || 0);
      }
    }
    const sorted = [...sample].sort((a, b) => compare('nuget', a, b) ?? 0);
    expect(sorted).toEqual(sample);
  });
});

describe('isVersionAffected', () => {
  const range = (fields: Partial<AffectedRange>) => ({ ...fields });

  describe('fixed (exclusive upper bound)', () => {
    const affected = range({ introduced: '0', fixed: '1.5.0' });

    it('flags versions below the fix', () => {
      expect(isVersionAffected('nuget', '1.4.0', affected)).toBe(true);
      expect(isVersionAffected('nuget', '0.0.1', affected)).toBe(true);
      expect(isVersionAffected('nuget', '1.4.9.9', affected)).toBe(true);
    });

    it('does not flag the first fixed version nor later ones', () => {
      expect(isVersionAffected('nuget', '1.5.0', affected)).toBe(false);
      expect(isVersionAffected('nuget', '1.5', affected)).toBe(false);
      expect(isVersionAffected('nuget', '1.5.1', affected)).toBe(false);
      expect(isVersionAffected('nuget', '2.0.0', affected)).toBe(false);
    });

    it('flags the pre-release of the fixed version (it sorts below it)', () => {
      expect(isVersionAffected('nuget', '1.5.0-beta', affected)).toBe(true);
    });
  });

  describe('introduced (inclusive lower bound)', () => {
    const affected = range({ introduced: '2.0.0', fixed: '2.1.0' });

    it('does not flag versions before it (the SAMPLE-0003 case for 1.4.0)', () => {
      expect(isVersionAffected('nuget', '1.4.0', affected)).toBe(false);
      expect(isVersionAffected('nuget', '1.99.99', affected)).toBe(false);
    });

    it('flags the introduced version itself and the ones up to the fix', () => {
      expect(isVersionAffected('nuget', '2.0.0', affected)).toBe(true);
      expect(isVersionAffected('nuget', '2.0.5', affected)).toBe(true);
      expect(isVersionAffected('nuget', '2.1.0', affected)).toBe(false);
    });

    it('treats "0" and an absent value as "from the start"', () => {
      expect(
        isVersionAffected('nuget', '0.0.0-alpha', range({ introduced: '0', fixed: '1.0.0' })),
      ).toBe(true);
      expect(isVersionAffected('nuget', '0.1.0', range({ fixed: '1.0.0' }))).toBe(true);
    });
  });

  describe('lastAffected (inclusive upper bound)', () => {
    const affected = range({ introduced: '1.0.0', lastAffected: '1.4.9' });

    it('flags up to and including the last affected version', () => {
      expect(isVersionAffected('nuget', '1.4.9', affected)).toBe(true);
      expect(isVersionAffected('nuget', '1.0.0', affected)).toBe(true);
    });

    it('does not flag above it or below the introduction', () => {
      expect(isVersionAffected('nuget', '1.4.10', affected)).toBe(false);
      expect(isVersionAffected('nuget', '0.9.0', affected)).toBe(false);
    });
  });

  it('flags every later version of an open-ended range (introduced, no fix)', () => {
    const affected = range({ introduced: '3.0.0' });
    expect(isVersionAffected('nuget', '2.9.9', affected)).toBe(false);
    expect(isVersionAffected('nuget', '3.0.0', affected)).toBe(true);
    expect(isVersionAffected('nuget', '99.0.0', affected)).toBe(true);
  });

  describe('explicit version list', () => {
    const affected = range({ versions: ['1.0.0', '1.0.2'] });

    it('flags exactly the listed versions, however they are written', () => {
      expect(isVersionAffected('nuget', '1.0.0', affected)).toBe(true);
      expect(isVersionAffected('nuget', '1.0.2.0', affected)).toBe(true);
      expect(isVersionAffected('nuget', '1.0.1', affected)).toBe(false);
    });

    it('is an alternative to the bounds, not an extra condition', () => {
      const both = range({ introduced: '2.0.0', fixed: '3.0.0', versions: ['1.0.0'] });
      expect(isVersionAffected('nuget', '1.0.0', both)).toBe(true);
      expect(isVersionAffected('nuget', '2.5.0', both)).toBe(true);
      expect(isVersionAffected('nuget', '1.5.0', both)).toBe(false);
    });
  });

  describe('conservative on anything it cannot compare', () => {
    it('never flags a version that is not a version (a declared range, a wildcard)', () => {
      const affected = range({ introduced: '0', fixed: '9.0.0' });
      expect(isVersionAffected('nuget', '[1.0,2.0)', affected)).toBe(false);
      expect(isVersionAffected('nuget', '1.*', affected)).toBe(false);
      expect(isVersionAffected('nuget', 'latest', affected)).toBe(false);
    });

    it('never flags when a bound cannot be parsed', () => {
      expect(isVersionAffected('nuget', '1.0.0', range({ introduced: '0', fixed: 'soon' }))).toBe(
        false,
      );
    });

    it('never flags a range that says nothing', () => {
      expect(isVersionAffected('nuget', '1.0.0', range({}))).toBe(false);
    });
  });

  it('applies the rules of the ecosystem: UPM is three parts, NuGet allows four', () => {
    expect(isVersionAffected('upm', '14.0.9', range({ introduced: '0', fixed: '14.0.10' }))).toBe(
      true,
    );
    expect(isVersionAffected('upm', '14.0.10', range({ introduced: '0', fixed: '14.0.10' }))).toBe(
      false,
    );
    expect(isVersionAffected('upm', '1.2.3.4', range({ introduced: '0', fixed: '9.0.0' }))).toBe(
      false,
    );
    expect(isVersionAffected('nuget', '1.2.3.4', range({ introduced: '0', fixed: '9.0.0' }))).toBe(
      true,
    );
  });
});
