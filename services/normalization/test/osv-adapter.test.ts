import { fileURLToPath } from 'node:url';

import { KnowledgeObject } from '@gyde/contracts';
import { CircuitBreaker, CircuitOpenError } from '@gyde/resilience';
import { describe, expect, it, vi } from 'vitest';

import { InvalidRecordError } from '../src/domain/invalid-record-error';
import { normalizeOsvRecord } from '../src/domain/osv-normalizer';
import {
  OsvAdapter,
  type OsvAdapterOptions,
} from '../src/infrastructure/sources/structured/osv.adapter';

const fixturesDir = fileURLToPath(new URL('../../../fixtures/sources', import.meta.url));
const NOW = new Date('2026-10-01T12:00:00Z');
const INGESTED_AT = NOW.toISOString();

const breaker = () =>
  new CircuitBreaker({
    name: 'normalization->osv',
    failureThreshold: 2,
    failureRate: 1.01, // only consecutive failures open it in these tests
    windowMs: 60_000,
    openTimeoutMs: 60_000,
    halfOpenMaxCalls: 1,
    callTimeoutMs: 5_000,
  });

function adapter(overrides: Partial<OsvAdapterOptions> = {}) {
  return new OsvAdapter({
    useFixtures: true,
    fixturesDir,
    apiUrl: 'https://osv.test',
    bucketUrl: 'https://bucket.test',
    breaker: breaker(),
    fetch: () => Promise.reject(new Error('the network must not be touched')),
    now: () => NOW,
    ...overrides,
  });
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

const pkg = (name: string) => ({ ecosystem: 'NuGet', name });

const advisory = (extra: Record<string, unknown> = {}) => ({
  id: 'TEST-1',
  summary: 'A test advisory',
  affected: [
    {
      package: pkg('Acme.Pkg'),
      ranges: [{ type: 'ECOSYSTEM', events: [{ introduced: '0' }, { fixed: '1.0.0' }] }],
    },
  ],
  ...extra,
});

const V3_CRITICAL = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H';

describe('OSV fixtures', () => {
  it('ingests every advisory in fixtures/sources/osv, in a stable order', async () => {
    const records = await collect(adapter().fetchChanges());
    expect(records.map((record) => record.sourceId)).toEqual([
      'SAMPLE-0001',
      'SAMPLE-0002',
      'SAMPLE-0003',
    ]);
  });

  it('normalizes SAMPLE-0001 into the object the rest of the system expects', async () => {
    const [record] = await collect(adapter().fetchChanges());
    const [object] = adapter().normalize(record!);

    expect(object).toEqual({
      id: 'osv:SAMPLE-0001',
      kind: 'vulnerability',
      source: 'osv',
      sourceKind: 'structured',
      trust: 'high',
      title: 'Sample advisory: unsafe deserialization in Acme.Serialization',
      summary:
        'Synthetic advisory used for tests and mocks. It does not describe a real vulnerability.',
      aliases: ['SAMPLE-0001'],
      severity: 'high',
      cvss: 7.5,
      affected: [
        { ecosystem: 'nuget', name: 'Acme.Serialization', introduced: '0', fixed: '1.5.0' },
      ],
      gameEngines: [],
      url: 'https://example.com/advisories/sample-0001',
      publishedAt: '2026-01-15T00:00:00Z',
      modifiedAt: '2026-02-01T00:00:00Z',
      ingestedAt: INGESTED_AT,
    });
  });

  it('keeps SAMPLE-0002 (other package) and SAMPLE-0003 (2.0.0 to 2.1.0) apart, with their ranges', async () => {
    const records = await collect(adapter().fetchChanges());
    const byId = new Map(
      records.flatMap((record) => adapter().normalize(record)).map((object) => [object.id, object]),
    );

    expect(byId.get('osv:SAMPLE-0002')).toMatchObject({
      severity: 'medium', // MODERATE
      cvss: 4.4,
      affected: [{ ecosystem: 'nuget', name: 'Acme.Unrelated', introduced: '0', fixed: '3.0.0' }],
    });
    expect(byId.get('osv:SAMPLE-0003')).toMatchObject({
      severity: 'low',
      cvss: 2.5,
      affected: [
        { ecosystem: 'nuget', name: 'Acme.Serialization', introduced: '2.0.0', fixed: '2.1.0' },
      ],
    });
  });

  it('every normalized object validates against the KnowledgeObject contract', async () => {
    const records = await collect(adapter().fetchChanges());
    const objects = records.flatMap((record) => adapter().normalize(record));
    expect(objects).toHaveLength(3);
    for (const object of objects) expect(() => KnowledgeObject.parse(object)).not.toThrow();
  });

  it('only returns advisories modified after `since`', async () => {
    const records = await collect(adapter().fetchChanges(new Date('2026-02-02T00:00:00Z')));
    expect(records.map((record) => record.sourceId)).toEqual(['SAMPLE-0003']);
  });

  it('never touches the network', async () => {
    const fetchSpy = vi.fn();
    await collect(adapter({ fetch: fetchSpy }).fetchChanges());
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('normalizeOsvRecord', () => {
  const normalize = (payload: unknown) => normalizeOsvRecord(payload, INGESTED_AT);

  it('is pure: the same record gives the same object', () => {
    expect(normalize(advisory())).toEqual(normalize(advisory()));
  });

  it('turns every introduced/fixed pair into its own range', () => {
    const [object] = normalize(
      advisory({
        affected: [
          {
            package: pkg('Acme.Pkg'),
            ranges: [
              {
                type: 'SEMVER',
                events: [
                  { introduced: '1.0.0' },
                  { fixed: '1.2.0' },
                  { introduced: '2.0.0' },
                  { fixed: '2.1.0' },
                ],
              },
            ],
          },
        ],
      }),
    );
    expect(object?.affected).toEqual([
      { ecosystem: 'nuget', name: 'Acme.Pkg', introduced: '1.0.0', fixed: '1.2.0' },
      { ecosystem: 'nuget', name: 'Acme.Pkg', introduced: '2.0.0', fixed: '2.1.0' },
    ]);
  });

  it('keeps last_affected and open-ended ranges', () => {
    const [object] = normalize(
      advisory({
        affected: [
          {
            package: pkg('Acme.Pkg'),
            ranges: [
              { type: 'ECOSYSTEM', events: [{ introduced: '1.0.0' }, { last_affected: '1.4.9' }] },
              { type: 'ECOSYSTEM', events: [{ introduced: '3.0.0' }] },
            ],
          },
        ],
      }),
    );
    expect(object?.affected).toEqual([
      { ecosystem: 'nuget', name: 'Acme.Pkg', introduced: '1.0.0', lastAffected: '1.4.9' },
      { ecosystem: 'nuget', name: 'Acme.Pkg', introduced: '3.0.0' },
    ]);
  });

  it('keeps an explicit versions list as an independent way to be affected', () => {
    const [object] = normalize(
      advisory({ affected: [{ package: pkg('Acme.Pkg'), versions: ['1.0.0', '1.0.1'] }] }),
    );
    expect(object?.affected).toEqual([
      { ecosystem: 'nuget', name: 'Acme.Pkg', versions: ['1.0.0', '1.0.1'] },
    ]);
  });

  it('ignores GIT ranges and packages of ecosystems Gyde does not cover', () => {
    const [object] = normalize(
      advisory({
        affected: [
          {
            package: { ecosystem: 'npm', name: 'left-pad' },
            ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }] }],
          },
          {
            package: pkg('Acme.Pkg'),
            ranges: [{ type: 'GIT', events: [{ introduced: 'abc123' }] }],
          },
          {
            package: { ecosystem: 'nuget', name: 'Acme.Other' },
            ranges: [{ type: 'ECOSYSTEM', events: [{ introduced: '0' }, { fixed: '2.0.0' }] }],
          },
        ],
      }),
    );
    expect(object?.affected).toEqual([
      { ecosystem: 'nuget', name: 'Acme.Other', introduced: '0', fixed: '2.0.0' },
    ]);
  });

  it('answers nothing for withdrawn advisories and for ones that affect no supported package', () => {
    expect(normalize(advisory({ withdrawn: '2026-03-01T00:00:00Z' }))).toEqual([]);
    expect(
      normalize(advisory({ affected: [{ package: { ecosystem: 'PyPI', name: 'x' } }] })),
    ).toEqual([]);
    expect(normalize(advisory({ affected: [] }))).toEqual([]);
  });

  describe('severity', () => {
    const withLabel = (label: string, severity: unknown[] = []) =>
      normalize(advisory({ database_specific: { severity: label }, severity }))[0];

    it('takes the label of the source first', () => {
      expect(withLabel('CRITICAL')?.severity).toBe('critical');
      expect(withLabel('MODERATE')?.severity).toBe('medium');
      // The label wins even when the vector would rate higher.
      expect(withLabel('LOW', [{ type: 'CVSS_V3', score: V3_CRITICAL }])?.severity).toBe('low');
    });

    it('falls back to the standard CVSS thresholds when there is no label', () => {
      const [object] = normalize(advisory({ severity: [{ type: 'CVSS_V3', score: V3_CRITICAL }] }));
      expect(object).toMatchObject({ severity: 'critical', cvss: 9.8 });
    });

    it('leaves severity and cvss out when the source gives neither (or only CVSS v4)', () => {
      const v4 = 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N';
      const [object] = normalize(advisory({ severity: [{ type: 'CVSS_V4', score: v4 }] }));
      expect(object).not.toHaveProperty('severity');
      expect(object).not.toHaveProperty('cvss');
    });
  });

  it('lists the advisory id first, then its aliases, without repeats', () => {
    const [object] = normalize(
      advisory({ id: 'GHSA-aaaa-bbbb-cccc', aliases: ['CVE-2026-1', 'GHSA-aaaa-bbbb-cccc'] }),
    );
    expect(object?.aliases).toEqual(['GHSA-aaaa-bbbb-cccc', 'CVE-2026-1']);
  });

  it('falls back to the first line of the details, then to the id, for the title', () => {
    const fromDetails = normalize(advisory({ summary: undefined, details: 'First line\nMore' }));
    expect(fromDetails[0]?.title).toBe('First line');
    expect(normalize(advisory({ summary: undefined }))[0]?.title).toBe('TEST-1');
  });

  it('truncates what the contract limits instead of rejecting the advisory', () => {
    const [object] = normalize(advisory({ summary: 'x'.repeat(900), details: 'y'.repeat(20_000) }));
    expect(object?.title).toHaveLength(500);
    expect(object?.summary).toHaveLength(10_000);
  });

  it('drops a reference that is not a URL instead of failing', () => {
    const [object] = normalize(advisory({ references: [{ type: 'ADVISORY', url: 'not a url' }] }));
    expect(object).not.toHaveProperty('url');
  });

  it.each([
    ['not an object', 'text'],
    ['no id', {}],
    ['an affected entry of the wrong shape', advisory({ affected: 'nope' })],
    ['a bad date', advisory({ published: 'yesterday' })],
  ])('throws InvalidRecordError for %s', (_label, payload) => {
    expect(() => normalize(payload)).toThrow(InvalidRecordError);
  });
});

describe('OSV over the network', () => {
  const csv = [
    '2026-09-30T10:00:00Z,SAMPLE-0001',
    '2026-09-20T10:00:00Z,SAMPLE-0002',
    '2026-07-01T10:00:00Z,SAMPLE-OLD', // outside the first-ingestion window
  ].join('\n');

  function server(handler?: (url: string) => Response | undefined) {
    const calls: string[] = [];
    const fetchFake = async (input: string | URL | Request): Promise<Response> => {
      const url = String(input);
      calls.push(url);
      const custom = handler?.(url);
      if (custom) return custom;
      if (url.endsWith('/NuGet/modified_id.csv')) return new Response(csv);
      const id = decodeURIComponent(url.split('/v1/vulns/')[1] ?? '');
      return Response.json(advisory({ id }));
    };
    return { calls, fetchFake: fetchFake as typeof fetch };
  }

  it('lists what changed, then fetches each advisory from the API', async () => {
    const { calls, fetchFake } = server();
    const records = await collect(adapter({ useFixtures: false, fetch: fetchFake }).fetchChanges());

    expect(records.map((record) => record.sourceId)).toEqual(['SAMPLE-0001', 'SAMPLE-0002']);
    expect(calls).toEqual([
      'https://bucket.test/NuGet/modified_id.csv',
      'https://osv.test/v1/vulns/SAMPLE-0001',
      'https://osv.test/v1/vulns/SAMPLE-0002',
    ]);
  });

  it('honors `since` for incremental ingestion', async () => {
    const { fetchFake } = server();
    const osv = adapter({ useFixtures: false, fetch: fetchFake });
    const records = await collect(osv.fetchChanges(new Date('2026-09-25T00:00:00Z')));
    expect(records.map((record) => record.sourceId)).toEqual(['SAMPLE-0001']);
  });

  it('skips an advisory that disappeared between the listing and the fetch (404)', async () => {
    const { fetchFake } = server((url) =>
      url.endsWith('SAMPLE-0001') ? new Response('', { status: 404 }) : undefined,
    );
    const records = await collect(adapter({ useFixtures: false, fetch: fetchFake }).fetchChanges());
    expect(records.map((record) => record.sourceId)).toEqual(['SAMPLE-0002']);
  });

  it('fails with a secret-free error when OSV answers badly', async () => {
    const { fetchFake } = server(() => new Response('boom', { status: 503 }));
    const osv = adapter({ useFixtures: false, fetch: fetchFake });
    await expect(collect(osv.fetchChanges())).rejects.toThrow('OSV answered 503');
  });

  it('opens the circuit after repeated failures and stops calling OSV', async () => {
    const { calls, fetchFake } = server(() => new Response('boom', { status: 503 }));
    const osv = adapter({ useFixtures: false, fetch: fetchFake });

    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(collect(osv.fetchChanges())).rejects.toThrow('OSV answered 503');
    }
    const callsBefore = calls.length;
    await expect(collect(osv.fetchChanges())).rejects.toBeInstanceOf(CircuitOpenError);
    expect(calls).toHaveLength(callsBefore);
  });
});

describe('normalizeOsvRecord: tolerance, defaults and error messages (pinned before the refactor)', () => {
  const normalize = (payload: unknown) => normalizeOsvRecord(payload, INGESTED_AT);
  const thrown = (payload: unknown): InvalidRecordError => {
    try {
      normalize(payload);
    } catch (error) {
      return error as InvalidRecordError;
    }
    throw new Error('expected InvalidRecordError');
  };
  const range = { type: 'ECOSYSTEM', events: [{ introduced: '0' }] };
  const affected = (name = 'P') => [{ package: pkg(name), ranges: [range] }];

  it('accepts unknown fields at every level', () => {
    const [object] = normalize({
      id: 'X-1',
      extra: 1,
      severity: [{ type: 'CVSS_V3', score: V3_CRITICAL, more: true }],
      references: [{ type: 'ADVISORY', url: 'https://example.com/a', more: 1 }],
      database_specific: { severity: 'HIGH', other: 1 },
      affected: [
        {
          extra: 1,
          package: { ecosystem: 'NuGet', name: 'P', purl: 'x' },
          ranges: [{ type: 'ECOSYSTEM', extra: 1, events: [{ introduced: '0', extra: 1 }] }],
        },
      ],
    });
    expect(object).toMatchObject({ id: 'osv:X-1', severity: 'high', cvss: 9.8 });
    expect(Object.keys(object ?? {})).not.toContain('extra');
  });

  it('treats omitted arrays as empty', () => {
    expect(normalize({ id: 'X-1' })).toEqual([]); // no affected
    const [object] = normalize({
      id: 'X-1',
      affected: [{ package: pkg('P'), versions: ['1.0.0'] }],
    });
    expect(object).toMatchObject({
      aliases: ['X-1'],
      affected: [{ ecosystem: 'nuget', name: 'P', versions: ['1.0.0'] }],
    });
    expect(
      normalize({ id: 'X-1', affected: [{ package: pkg('P'), ranges: [{ type: 'ECOSYSTEM' }] }] }),
    ).toEqual([]);
  });

  it('ignores an affected entry without a package', () => {
    expect(normalize({ id: 'X-1', affected: [{ ranges: [range] }] })).toEqual([]);
  });

  it.each([
    ['no id', {}, 'unknown', 'Invalid input: expected string, received undefined'],
    ['a non-string id', { id: 5 }, 'unknown', 'Invalid input: expected string, received number'],
    ['not an object', 'text', 'unknown', 'Invalid input: expected object, received string'],
    ['an empty id', { id: '' }, '', 'Too small: expected string to have >=1 characters'],
    [
      'null in an array field',
      { id: 'A', aliases: null },
      'A',
      'Invalid input: expected array, received null',
    ],
    [
      'an empty package name',
      { id: 'A', affected: [{ package: pkg('') }] },
      'A',
      'Too small: expected string to have >=1 characters',
    ],
  ])('rejects %s with the exact message', (_label, payload, sourceId, detail) => {
    const error = thrown(payload);
    expect(error).toBeInstanceOf(InvalidRecordError);
    expect(error.source).toBe('osv');
    expect(error.sourceId).toBe(sourceId);
    expect(error.message).toBe(`Invalid osv record "${sourceId}": ${detail}`);
  });

  it('rejects an id longer than 90 characters', () => {
    expect(thrown({ id: 'x'.repeat(91) }).message).toContain(
      'Too big: expected string to have <=90 characters',
    );
  });

  it('the contract still rejects what the record schema lets through, with the bare advisory id', () => {
    const badDate = thrown(advisory({ id: 'A', published: 'yesterday' }));
    expect(badDate.message).toBe('Invalid osv record "A": Invalid ISO datetime');
    const longName = thrown({ id: 'A', affected: affected('P'.repeat(201)) });
    expect(longName.message).toBe(
      'Invalid osv record "A": Too big: expected string to have <=200 characters',
    );
  });

  describe('reference url', () => {
    const urlOf = (references: unknown[]) =>
      (normalize({ id: 'X-1', affected: affected(), references })[0] as { url?: string }).url;

    it('prefers the ADVISORY reference over the first one', () => {
      expect(
        urlOf([
          { type: 'WEB', url: 'https://example.com/web' },
          { type: 'ADVISORY', url: 'https://example.com/advisory' },
        ]),
      ).toBe('https://example.com/advisory');
    });

    it('uses the first reference when none is an ADVISORY', () => {
      expect(
        urlOf([
          { type: 'WEB', url: 'https://example.com/one' },
          { url: 'https://example.com/two' },
        ]),
      ).toBe('https://example.com/one');
    });

    it('drops an invalid chosen url without falling through to the next reference', () => {
      expect(
        urlOf([
          { type: 'ADVISORY', url: 'not a url' },
          { type: 'WEB', url: 'https://example.com/ok' },
        ]),
      ).toBeUndefined();
    });
  });
});
