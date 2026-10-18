import { KnowledgeObject, type SourceKind, type Trust } from '@gyde/contracts';
import { afterAll, describe, expect, it } from 'vitest';

import {
  IngestionFailedError,
  IngestionInProgressError,
  UnknownSourceError,
} from '../src/application/errors';
import { IngestSourceUseCase as IngestSource } from '../src/application/use-cases/ingest-source.use-case';
import { ListSourcesUseCase as ListSources } from '../src/application/use-cases/list-sources.use-case';
import type { RawRecord, SourceAdapter } from '../src/application/ports/source-adapter';
import { InvalidRecordError } from '../src/domain/invalid-record-error';
import { PostgresKnowledgeRepository } from '../src/infrastructure/repositories/postgres-knowledge.repository';
import { createPgliteDatabase } from './support/pglite';

const database = createPgliteDatabase();
await database.migrate();
const repository = new PostgresKnowledgeRepository(database);
afterAll(() => database.close());

const T0 = new Date('2026-10-01T10:00:00Z');
let tick = 0;
const clock = () => new Date(T0.getTime() + tick++ * 1000);

function objectFor(source: string, id: string, pkg: string): KnowledgeObject {
  return KnowledgeObject.parse({
    id: `${source}:${id}`,
    kind: 'vulnerability',
    source,
    sourceKind: 'structured',
    trust: 'high',
    title: `Advisory ${id}`,
    affected: [{ ecosystem: 'nuget', name: pkg, introduced: '0', fixed: '2.0.0' }],
    ingestedAt: '2026-10-01T10:00:00Z',
  });
}

/** A scripted source: yields `records` (or throws `failure` after the first one). */
function fakeSource(
  name: string,
  records: RawRecord[],
  options: { failure?: Error; kind?: SourceKind; trust?: Trust } = {},
): SourceAdapter & { seenSince: (Date | undefined)[] } {
  const seenSince: (Date | undefined)[] = [];
  return {
    name,
    kind: options.kind ?? 'structured',
    trust: options.trust ?? 'high',
    seenSince,
    async *fetchChanges(since) {
      seenSince.push(since);
      for (const [index, record] of records.entries()) {
        if (options.failure && index === 1) throw options.failure;
        yield record;
      }
    },
    normalize(record) {
      const { id, pkg } = record.payload as { id?: string; pkg?: string };
      if (!id || !pkg) throw new InvalidRecordError(name, record.sourceId, 'missing fields');
      return [objectFor(name, id, pkg)];
    },
  };
}

const record = (id: string, pkg = 'Acme.Pkg'): RawRecord => ({
  sourceId: id,
  payload: { id, pkg },
});

const ask = (pkg: string) =>
  repository.query({ packages: [{ ecosystem: 'nuget', name: pkg, version: '1.0.0' }], limit: 100 });

describe('IngestSource', () => {
  it('stores what the source delivers and records a successful run', async () => {
    const source = fakeSource('alpha', [record('A-1'), record('A-2')]);
    const ingest = new IngestSource({ adapters: [source], repository, now: clock });

    const result = await ingest.execute('alpha');

    expect(result).toMatchObject({ source: 'alpha', recordsProcessed: 2, recordsSkipped: 0 });
    expect((await ask('Acme.Pkg')).map((object) => object.id)).toEqual(['alpha:A-1', 'alpha:A-2']);
    expect(await repository.lastIngestedAt('alpha')).toBeInstanceOf(Date);
  });

  it('skips and counts a malformed record without stopping the rest of the source', async () => {
    const source = fakeSource('beta', [
      record('B-1', 'Acme.Beta'),
      { sourceId: 'B-BAD', payload: {} },
      record('B-2', 'Acme.Beta'),
    ]);
    const ingest = new IngestSource({ adapters: [source], repository, now: clock });

    const result = await ingest.execute('beta');

    expect(result).toMatchObject({ recordsProcessed: 2, recordsSkipped: 1 });
    expect(await ask('Acme.Beta')).toHaveLength(2);
  });

  it('is incremental: the next run asks only for what changed since the last good one', async () => {
    const source = fakeSource('gamma', [record('G-1', 'Acme.Gamma')]);
    const ingest = new IngestSource({ adapters: [source], repository, now: clock });

    await ingest.execute('gamma');
    await ingest.execute('gamma');

    expect(source.seenSince[0]).toBeUndefined();
    expect(source.seenSince[1]).toBeInstanceOf(Date);
    expect(await ask('Acme.Gamma')).toHaveLength(1);
  });

  describe('a source that is down', () => {
    it('fails alone: the attempt is recorded, other sources ingest, stale knowledge is still served', async () => {
      const healthy = fakeSource('delta', [record('D-1', 'Acme.Delta')]);
      const flaky = fakeSource('epsilon', [record('E-1', 'Acme.Eps'), record('E-2', 'Acme.Eps')]);
      const ingest = new IngestSource({ adapters: [healthy, flaky], repository, now: clock });
      const list = new ListSources({ adapters: [healthy, flaky], repository });

      await ingest.execute('epsilon'); // a good run first: knowledge exists
      const down = fakeSource('epsilon', [record('E-1', 'Acme.Eps'), record('E-2')], {
        failure: new Error('OSV answered 503'),
      });
      const failing = new IngestSource({ adapters: [down, healthy], repository, now: clock });

      await expect(failing.execute('epsilon')).rejects.toBeInstanceOf(IngestionFailedError);
      await expect(failing.execute('delta')).resolves.toMatchObject({ recordsProcessed: 1 });

      // What was stored before keeps being served...
      expect(await ask('Acme.Eps')).toHaveLength(2);
      // ...and the status says what happened, without losing the last good time.
      const statuses = new Map((await list.execute()).sources.map((s) => [s.name, s]));
      expect(statuses.get('epsilon')).toMatchObject({
        status: 'failed',
        lastError: 'OSV answered 503',
      });
      expect(statuses.get('epsilon')?.lastIngestedAt).toBeDefined();
      expect(statuses.get('delta')).toMatchObject({ status: 'ok' });
    });

    it('does not move the "since" mark, so the next run retries from the last good one', async () => {
      const down = fakeSource('zeta', [record('Z-1', 'Acme.Z'), record('Z-2')], {
        failure: new Error('boom'),
      });
      const ingest = new IngestSource({ adapters: [down], repository, now: clock });

      await expect(ingest.execute('zeta')).rejects.toBeInstanceOf(IngestionFailedError);
      await expect(ingest.execute('zeta')).rejects.toBeInstanceOf(IngestionFailedError);

      expect(down.seenSince).toEqual([undefined, undefined]);
      expect(await repository.lastIngestedAt('zeta')).toBeUndefined();
    });

    it('keeps the error message short and free of the record contents', async () => {
      const down = fakeSource('eta', [record('H-1', 'Acme.H'), record('H-2')], {
        failure: new Error('x'.repeat(2000)),
      });
      const ingest = new IngestSource({ adapters: [down], repository, now: clock });

      await expect(ingest.execute('eta')).rejects.toThrow(IngestionFailedError);
      expect((await repository.lastRun('eta'))?.error).toHaveLength(500);
    });
  });

  it('refuses a source it does not know', async () => {
    const ingest = new IngestSource({ adapters: [], repository, now: clock });
    await expect(ingest.execute('nope')).rejects.toBeInstanceOf(UnknownSourceError);
  });

  it('runs one ingestion per source at a time', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow: SourceAdapter = {
      ...fakeSource('theta', [record('T-1', 'Acme.Theta')]),
      async *fetchChanges() {
        await gate;
        yield record('T-1', 'Acme.Theta');
      },
    };
    const ingest = new IngestSource({ adapters: [slow], repository, now: clock });

    const first = ingest.execute('theta');
    await expect(ingest.execute('theta')).rejects.toBeInstanceOf(IngestionInProgressError);
    release();
    await expect(first).resolves.toMatchObject({ recordsProcessed: 1 });
    // Once it finished, a new run is allowed again.
    await expect(ingest.execute('theta')).resolves.toBeDefined();
  });
});

describe('ListSources', () => {
  it('lists every configured source, sorted by name, with its kind and trust', async () => {
    const list = new ListSources({
      adapters: [
        fakeSource('lambda', [], { kind: 'community', trust: 'low' }),
        fakeSource('kappa', []),
      ],
      repository,
    });

    expect((await list.execute()).sources).toEqual([
      { name: 'kappa', kind: 'structured', trust: 'high', status: 'never' },
      { name: 'lambda', kind: 'community', trust: 'low', status: 'never' },
    ]);
  });
});
