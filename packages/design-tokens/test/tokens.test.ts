import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { cssVar, flattenTokens, loadTokens, resolveTokens, toCss, toJson } from '../src';

import { contrast, luminance } from './contrast';

const tokens = loadTokens(join(dirname(fileURLToPath(import.meta.url)), '..', 'tokens'));
const resolved = resolveTokens(tokens);
const color = (name: string) => String(resolved[name]);

describe('token files', () => {
  it('resolve every alias (a broken reference fails here, not in production)', () => {
    expect(Object.keys(resolved).length).toBe(tokens.length);
    expect(tokens.length).toBeGreaterThan(80);
  });

  it('keep the brand colors of the project deck', () => {
    expect(color('palette.green.600')).toBe('#0E7002');
    expect(color('palette.green.100')).toBe('#E1FEDE');
  });

  it('declare the three font families of the design', () => {
    expect(color('font.family.display')).toContain('Bricolage Grotesque');
    expect(color('font.family.body')).toContain('Figtree');
    expect(color('font.family.mono')).toContain('JetBrains Mono');
  });

  it('get lighter-to-darker scales without gaps in lightness', () => {
    for (const [scale, steps] of [
      ['green', ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']],
      ['ink', ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900']],
    ] as const) {
      const lightness = steps.map((step) => luminance(color(`palette.${scale}.${step}`)));
      expect([...lightness].sort((a, b) => b - a)).toEqual(lightness);
    }
  });
});

describe('accessibility (WCAG 2.x)', () => {
  const textPairs: [string, string, number][] = [
    ['color.fg.default', 'color.bg.surface', 7],
    ['color.fg.default', 'color.bg.canvas', 7],
    ['color.fg.muted', 'color.bg.surface', 7],
    ['color.fg.muted', 'color.bg.canvas', 4.5],
    ['color.fg.subtle', 'color.bg.surface', 4.5],
    ['color.fg.on-brand', 'color.action.primary.bg', 4.5],
    ['color.fg.on-brand', 'color.action.primary.bg-hover', 7],
    ['color.fg.on-brand', 'color.action.primary.bg-active', 7],
    ['color.fg.brand', 'color.bg.surface', 4.5],
    ['color.fg.brand', 'color.bg.canvas', 4.5],
    ['color.fg.brand-strong', 'color.bg.brand-subtle', 7],
    ['color.action.secondary.fg', 'color.action.secondary.bg', 7],
    ['color.action.secondary.fg', 'color.action.secondary.bg-hover', 7],
    ['color.status.success.fg', 'color.status.success.bg', 7],
    ...(['critical', 'high', 'medium', 'low', 'info'] as const).flatMap(
      (level): [string, string, number][] => [
        [`color.severity.${level}.fg`, `color.severity.${level}.bg`, 4.5],
        [`color.severity.${level}.fg`, 'color.bg.surface', 4.5],
      ],
    ),
  ];

  it.each(textPairs)('text %s on %s keeps at least %s:1', (foreground, background, minimum) => {
    expect(contrast(color(foreground), color(background))).toBeGreaterThanOrEqual(minimum);
  });

  const nonTextPairs: [string, string, number][] = [
    ['color.border.control', 'color.bg.surface', 3],
    ['color.border.control', 'color.bg.canvas', 3],
    ['color.focus.ring', 'color.bg.surface', 3],
    ['color.focus.ring', 'color.bg.canvas', 3],
  ];

  it.each(nonTextPairs)(
    'control %s on %s keeps at least %s:1',
    (foreground, background, minimum) => {
      expect(contrast(color(foreground), color(background))).toBeGreaterThanOrEqual(minimum);
    },
  );
});

describe('generated output', () => {
  const css = toCss(tokens);

  it('emits custom properties and keeps aliases as var() references', () => {
    expect(css).toContain('--gyde-palette-green-600: #0E7002;');
    expect(css).toContain('--gyde-color-action-primary-bg: var(--gyde-palette-green-600);');
  });

  it('zeroes the motion durations under prefers-reduced-motion', () => {
    expect(css).toMatch(
      /prefers-reduced-motion: reduce[\s\S]*--gyde-motion-duration-fast: 0\.01ms;/,
    );
  });

  it('exports a flat JSON with resolved values', () => {
    expect(JSON.parse(toJson(tokens))['color.action.primary.bg']).toBe('#0E7002');
  });

  it('builds var() references from dotted names', () => {
    expect(cssVar('color.bg.canvas')).toBe('var(--gyde-color-bg-canvas)');
  });
});

describe('guards', () => {
  it('rejects an alias to an unknown token', () => {
    expect(() => resolveTokens([{ path: ['a'], value: '{missing.token}' }])).toThrow(
      /unknown token/,
    );
  });

  it('rejects alias cycles', () => {
    expect(() =>
      resolveTokens([
        { path: ['a'], value: '{b}' },
        { path: ['b'], value: '{a}' },
      ]),
    ).toThrow(/cycle/i);
  });

  it('inherits $type from the group and ignores $-keys as token names', () => {
    const flat = flattenTokens({
      group: { $type: 'color', $description: 'x', one: { $value: '#000000' } },
    });
    expect(flat).toEqual([
      { path: ['group', 'one'], value: '#000000', type: 'color', description: undefined },
    ]);
  });
});
