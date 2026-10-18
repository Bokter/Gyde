import { describe, expect, it } from 'vitest';

import { sha256Hex } from '../src/infrastructure/adapters/sha256-hex.adapter';
import { SpdxLicenseExpressionParser } from '../src/infrastructure/adapters/spdx-license-expression-parser.adapter';

const parser = new SpdxLicenseExpressionParser();

describe('SpdxLicenseExpressionParser', () => {
  it('reads a single license', () => {
    expect(parser.parse('MIT')).toEqual({ license: 'MIT' });
  });

  it('reads the plus and a linking exception', () => {
    expect(parser.parse('GPL-2.0+')).toEqual({ license: 'GPL-2.0', plus: true });
    expect(parser.parse('GPL-2.0-only WITH Classpath-exception-2.0')).toEqual({
      license: 'GPL-2.0-only',
      exception: 'Classpath-exception-2.0',
    });
  });

  it('reads OR / AND with parentheses', () => {
    expect(parser.parse('MIT OR (Apache-2.0 AND ISC)')).toEqual({
      conjunction: 'or',
      left: { license: 'MIT' },
      right: {
        conjunction: 'and',
        left: { license: 'Apache-2.0' },
        right: { license: 'ISC' },
      },
    });
  });

  it.each(['MIT License', '', 'GPL-3.0 AND'])('throws on %j', (text) => {
    expect(() => parser.parse(text)).toThrow();
  });
});

describe('sha256Hex', () => {
  it('is the lowercase hex sha256 of the text', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
