import { PLAN_CATALOG, type ReportStatus } from '@gyde/contracts';
import { describe, expect, it } from 'vitest';

import type { AnalysisSnapshot } from '../src/domain/entities/analysis-types';
import { InMemoryReportRepository } from '../src/infrastructure/repositories/in-memory-report.repository';
import { PostgresReportRepository } from '../src/infrastructure/repositories/postgres-report.repository';
import { createPgliteDatabase } from './support/pglite';
import { viaSnapshots } from './support/snapshots';

function analysis(
  id: string,
  status: ReportStatus,
  createdAt = new Date().toISOString(),
): AnalysisSnapshot {
  return {
    id,
    tenantId: 'tenant-1',
    entitlements: PLAN_CATALOG.pro,
    aiExpected: true,
    status,
    createdAt,
  };
}

describe('PostgresReportRepository', () => {
  it('creates, reads back and updates an analysis on the same row', async () => {
    const database = createPgliteDatabase();
    await database.migrate();
    const repository = viaSnapshots(new PostgresReportRepository(database.db));

    const created = analysis('a-1', 'retrieving');
    await repository.create(created);
    expect(await repository.get('a-1')).toEqual(created);
    expect(await repository.get('ghost')).toBeUndefined();

    await repository.update({ ...created, status: 'ready', completedAt: new Date().toISOString() });
    const ready = await repository.get('a-1');
    expect(ready?.status).toBe('ready');
    expect(ready?.completedAt).toBeTruthy();

    // Another write to the same analysis upserts instead of failing on the primary key.
    await repository.update({ ...created, status: 'analyzing' });
    const analyzing = await repository.get('a-1');
    expect(analyzing?.status).toBe('analyzing');
    expect(analyzing?.completedAt).toBeUndefined();

    await database.close();
  });

  it('rejects a second create of the same analysis (the id is generated here)', async () => {
    const database = createPgliteDatabase();
    await database.migrate();
    const repository = viaSnapshots(new PostgresReportRepository(database.db));

    await repository.create(analysis('a-2', 'retrieving'));
    await expect(repository.create(analysis('a-2', 'retrieving'))).rejects.toThrow();

    await database.close();
  });

  it('findStale filters by status and by the cutoff of the startup sweep', async () => {
    const database = createPgliteDatabase();
    await database.migrate();
    const repository = viaSnapshots(new PostgresReportRepository(database.db));

    await repository.create(analysis('old', 'analyzing', '2020-01-01T00:00:00.000Z'));
    await repository.create(analysis('fresh', 'analyzing'));
    await repository.create(analysis('old-but-done', 'ready', '2020-01-01T00:00:00.000Z'));

    const cutoff = new Date(Date.now() - 60_000);
    const stale = await repository.findStale('analyzing', cutoff);
    expect(stale.map((row) => row.id)).toEqual(['old']);
    // The sweep only asks for `analyzing` and `retrieving`; a finished job is never touched,
    // even when its row is old.
    expect((await repository.findStale('ready', cutoff)).map((row) => row.id)).toEqual([
      'old-but-done',
    ]);
    expect(await repository.findStale('analyzing', new Date('2000-01-01T00:00:00.000Z'))).toEqual(
      [],
    );

    await database.close();
  });

  it('update refreshes the clock the sweep reads, so a job stops being stale', async () => {
    const database = createPgliteDatabase();
    await database.migrate();
    const repository = viaSnapshots(new PostgresReportRepository(database.db));

    await repository.create(analysis('a-3', 'analyzing', '2020-01-01T00:00:00.000Z'));
    const cutoff = new Date(Date.now() - 1_000);
    expect((await repository.findStale('analyzing', cutoff)).map((row) => row.id)).toEqual(['a-3']);

    const stored = await repository.get('a-3');
    await repository.update({ ...stored!, status: 'analyzing' });
    expect(await repository.findStale('analyzing', cutoff)).toEqual([]);

    await database.close();
  });

  it('the in-memory adapter never reports stale rows (a restart empties it)', async () => {
    const repository = viaSnapshots(new InMemoryReportRepository());
    await repository.create(analysis('a-4', 'analyzing', '2020-01-01T00:00:00.000Z'));
    expect(await repository.findStale('analyzing', new Date())).toEqual([]);
    expect((await repository.get('a-4'))?.status).toBe('analyzing');
  });
});
