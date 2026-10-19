import { describe, expect, it } from 'vitest';

import { normalizeOsvRecord } from '../src/domain/osv-normalizer';
import type { OsvRecordInput } from '../src/domain/osv-record';
import { toKnowledgeObjectContract } from '../src/http/mappers/normalization.mapper';

/** The normalizer works on plain, already validated input: no Zod, no contract, no parser. */
const AT = '2026-10-01T12:00:00Z';
const isUrl = (value: string) => value.startsWith('https://');

const record = (overrides: Partial<OsvRecordInput> = {}): OsvRecordInput => ({
  id: 'PLAIN-1',
  aliases: [],
  severity: [],
  references: [],
  affected: [
    {
      package: { ecosystem: 'NuGet', name: 'Acme.Pkg' },
      ranges: [{ type: 'ECOSYSTEM', events: [{ introduced: '0' }, { fixed: '1.0.0' }] }],
      versions: [],
    },
  ],
  ...overrides,
});

describe('normalizeOsvRecord on plain input', () => {
  it('maps an advisory into a knowledge object', () => {
    expect(
      normalizeOsvRecord(
        record({
          summary: ' Title ',
          details: 'Body line\nmore',
          aliases: ['CVE-1'],
          references: [{ type: 'ADVISORY', url: 'https://example.com/a' }],
          published: '2026-01-01T00:00:00Z',
        }),
        AT,
        isUrl,
      ),
    ).toEqual([
      {
        id: 'osv:PLAIN-1',
        kind: 'vulnerability',
        source: 'osv',
        sourceKind: 'structured',
        trust: 'high',
        title: 'Title',
        summary: 'Body line\nmore',
        aliases: ['PLAIN-1', 'CVE-1'],
        affected: [{ ecosystem: 'nuget', name: 'Acme.Pkg', introduced: '0', fixed: '1.0.0' }],
        gameEngines: [],
        url: 'https://example.com/a',
        publishedAt: '2026-01-01T00:00:00Z',
        ingestedAt: AT,
      },
    ]);
  });

  it('answers nothing for withdrawn advisories and unsupported ecosystems', () => {
    expect(normalizeOsvRecord(record({ withdrawn: AT }), AT, isUrl)).toEqual([]);
    expect(
      normalizeOsvRecord(
        record({
          affected: [{ package: { ecosystem: 'PyPI', name: 'x' }, ranges: [], versions: [] }],
        }),
        AT,
        isUrl,
      ),
    ).toEqual([]);
  });

  it('lets the injected predicate decide which reference url survives', () => {
    const withUrl = record({ references: [{ url: 'http://insecure.example.com' }] });
    expect(normalizeOsvRecord(withUrl, AT, isUrl)[0]).not.toHaveProperty('url');
    expect(normalizeOsvRecord(withUrl, AT, () => true)[0]).toMatchObject({
      url: 'http://insecure.example.com',
    });
  });

  it('takes the severity label first, then the CVSS thresholds', () => {
    const vector = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H';
    const severity = [{ type: 'CVSS_V3', score: vector }];
    expect(normalizeOsvRecord(record({ severity }), AT, isUrl)[0]).toMatchObject({
      severity: 'critical',
      cvss: 9.8,
    });
    expect(
      normalizeOsvRecord(
        record({ severity, database_specific: { severity: 'MODERATE' } }),
        AT,
        isUrl,
      )[0],
    ).toMatchObject({ severity: 'medium', cvss: 9.8 });
  });
});

describe('toKnowledgeObjectContract', () => {
  it('keeps the contract key order and leaves absent optional values out', () => {
    const [object] = normalizeOsvRecord(record(), AT, isUrl);
    const contract = toKnowledgeObjectContract(object!);

    expect(Object.keys(contract)).toEqual([
      'id',
      'kind',
      'source',
      'sourceKind',
      'trust',
      'title',
      'summary',
      'aliases',
      'affected',
      'gameEngines',
      'ingestedAt',
    ]);
  });
});
