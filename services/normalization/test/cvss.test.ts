import { describe, expect, it } from 'vitest';

import { cvssV3BaseScore, severityFromCvss } from '../src/domain/cvss';

const v31 = (metrics: string) => `CVSS:3.1/${metrics}`;

describe('cvssV3BaseScore', () => {
  it('scores the SAMPLE-0001 vector as 7.5 (the fixture the whole demo relies on)', () => {
    expect(cvssV3BaseScore('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H')).toBe(7.5);
  });

  // Scores published by FIRST (the CVSS v3.1 specification and calculator) for well-known vectors.
  it.each([
    ['AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', 9.8],
    ['AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H', 10.0],
    ['AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H', 9.9],
    ['AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N', 6.1],
    ['AV:N/AC:L/PR:L/UI:R/S:C/C:L/I:L/A:N', 5.4],
    ['AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H', 8.1],
    ['AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H', 8.8],
    ['AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H', 7.2],
    ['AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H', 7.8],
    ['AV:L/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H', 7.8],
    ['AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N', 5.3],
  ])('scores %s as %s', (metrics, expected) => {
    expect(cvssV3BaseScore(v31(metrics))).toBe(expected);
  });

  it('scores no impact as 0', () => {
    expect(cvssV3BaseScore(v31('AV:P/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N'))).toBe(0);
    expect(cvssV3BaseScore(v31('AV:N/AC:L/PR:N/UI:N/S:C/C:N/I:N/A:N'))).toBe(0);
  });

  it('accepts v3.0 vectors', () => {
    expect(cvssV3BaseScore('CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toBe(9.8);
  });

  it('ignores temporal and environmental metrics: only the base score counts', () => {
    const base = v31('AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H');
    expect(cvssV3BaseScore(`${base}/E:U/RL:O/RC:C/CR:H/MAV:P`)).toBe(7.5);
  });

  it('is deterministic and never above 10', () => {
    const vector = v31('AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H');
    expect(cvssV3BaseScore(vector)).toBe(cvssV3BaseScore(vector));
    expect(cvssV3BaseScore(vector)).toBeLessThanOrEqual(10);
  });

  it.each([
    ['an empty string', ''],
    ['a CVSS v2 vector', 'AV:N/AC:L/Au:N/C:P/I:P/A:P'],
    ['a CVSS v4 vector', 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N'],
    ['a missing metric', 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N'],
    ['an unknown value', v31('AV:X/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H')],
    ['a prototype key as value', v31('AV:constructor/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H')],
    ['a repeated metric', v31('AV:N/AV:L/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H')],
    ['a metric without value', v31('AV/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H')],
  ])('answers undefined for %s', (_label, vector) => {
    expect(cvssV3BaseScore(vector)).toBeUndefined();
  });
});

describe('severityFromCvss', () => {
  it.each([
    [10, 'critical'],
    [9.0, 'critical'],
    [8.9, 'high'],
    [7.0, 'high'],
    [6.9, 'medium'],
    [4.0, 'medium'],
    [3.9, 'low'],
    [0.1, 'low'],
    [0, 'info'],
  ] as const)('rates %s as %s', (score, severity) => {
    expect(severityFromCvss(score)).toBe(severity);
  });
});
