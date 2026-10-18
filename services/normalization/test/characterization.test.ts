import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HEADERS } from '@gyde/contracts';
import { sampleAnalysisRequest } from '@gyde/contracts/samples';
import { CircuitBreaker } from '@gyde/resilience';
import { createLogger } from '@gyde/service-kit';
import { afterAll, describe, expect, it } from 'vitest';

import type { SourceAdapter } from '../src/application/ports/source-adapter';
import { configSchema } from '../src/config';
import { createApp } from '../src/http/app';
import { OsvAdapter } from '../src/infrastructure/sources/structured/osv.adapter';
import { createPgliteDatabase } from './support/pglite';

/**
 * Pins the external behavior of the HTTP edge before the Clean Architecture refactor: error
 * envelopes of the ingest route and the exact JSON shape of the stored objects.
 */
const token = 'test-internal-token-123456';
const fixturesDir = fileURLToPath(new URL('../../../fixtures/sources', import.meta.url));
const config = configSchema.parse({
  INTERNAL_SERVICE_TOKEN: token,
  INGEST_FIXTURES_DIR: fixturesDir,
});
const auth = { [HEADERS.internalToken]: token };
const logger = createLogger({ name: 'normalization-characterization', level: 'silent' });

const open: { close(): Promise<unknown> }[] = [];
afterAll(async () => {
  for (const app of open) await app.close();
});

async function appWith(adapters?: SourceAdapter[]) {
  const app = await createApp({ config, logger, database: createPgliteDatabase(), adapters });
  open.push(app);
  return app;
}

const post = (app: Awaited<ReturnType<typeof appWith>>, url: string, payload?: object) =>
  app.inject({ method: 'POST', url, headers: auth, payload });

function scripted(name: string, fetchChanges: SourceAdapter['fetchChanges']): SourceAdapter {
  return { name, kind: 'structured', trust: 'high', fetchChanges, normalize: () => [] };
}

describe('POST /internal/ingest/:source error envelopes', () => {
  it('404 for an unknown source, with the exact message', async () => {
    const app = await appWith();
    const res = await post(app, '/internal/ingest/nope');

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatchObject({ code: 'not_found', message: 'Unknown source "nope"' });
    expect(res.json().error).not.toHaveProperty('details');
  });

  it('409 while the same source is already being ingested', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let entered!: () => void;
    const started = new Promise<void>((resolve) => (entered = resolve));
    const slow = scripted('slow', async function* () {
      entered();
      await gate;
      yield* [];
    });
    const app = await appWith([slow]);

    const first = post(app, '/internal/ingest/slow');
    await started;
    const second = await post(app, '/internal/ingest/slow');
    release();

    expect(second.statusCode).toBe(409);
    expect(second.json().error).toMatchObject({
      code: 'conflict',
      message: 'Source "slow" is already being ingested',
    });
    expect((await first).statusCode).toBe(200);
  });

  it('503 with details.source when the source fails, and /sources reports the failure', async () => {
    const broken = scripted('broken', async function* () {
      yield* [];
      throw new Error('upstream is down');
    });
    const app = await appWith([broken]);

    const res = await post(app, '/internal/ingest/broken');
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toMatchObject({
      code: 'upstream_unavailable',
      message: 'Ingestion of "broken" failed: upstream is down',
      details: { source: 'broken' },
    });

    const sources = await app.inject({ method: 'GET', url: '/internal/sources', headers: auth });
    expect(sources.json().sources[0]).toMatchObject({
      name: 'broken',
      status: 'failed',
      lastError: 'upstream is down',
    });
  });

  it('a non-InvalidRecordError thrown by normalize() fails the run (503), it is not skipped', async () => {
    const bad: SourceAdapter = {
      ...scripted('bad', async function* () {
        yield { sourceId: 'X', payload: {} };
      }),
      normalize: () => {
        throw new Error('boom');
      },
    };
    const app = await appWith([bad]);

    const res = await post(app, '/internal/ingest/bad');
    expect(res.statusCode).toBe(503);
    expect(res.json().error.message).toBe('Ingestion of "bad" failed: boom');
  });

  it('a fixture without id fails the whole run (503), it is not counted as skipped', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'osv-fixtures-'));
    await mkdir(join(dir, 'osv'));
    await writeFile(join(dir, 'osv', 'NO-ID.json'), JSON.stringify({ summary: 'no id' }));
    const osv = new OsvAdapter({
      useFixtures: true,
      fixturesDir: dir,
      apiUrl: 'https://osv.test',
      bucketUrl: 'https://bucket.test',
      breaker: new CircuitBreaker({
        name: 'normalization->osv',
        failureThreshold: 5,
        failureRate: 1.01,
        windowMs: 60_000,
        openTimeoutMs: 60_000,
        halfOpenMaxCalls: 1,
        callTimeoutMs: 5_000,
      }),
    });
    const app = await appWith([osv]);

    const res = await post(app, '/internal/ingest/osv');
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toMatchObject({
      code: 'upstream_unavailable',
      message: 'Ingestion of "osv" failed: Invalid osv record "NO-ID.json": missing id',
    });
  });
});

describe('POST /internal/knowledge/query', () => {
  it('rejects unknown keys with 400 (strict contract)', async () => {
    const app = await appWith();
    const res = await post(app, '/internal/knowledge/query', {
      packages: [{ ecosystem: 'nuget', name: 'A', version: '1' }],
      extra: true,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_request');
  });

  it('serializes stored objects with the schema key order and no null or undefined values', async () => {
    const app = await appWith();
    await post(app, '/internal/ingest/osv');
    const res = await post(app, '/internal/knowledge/query', {
      packages: sampleAnalysisRequest.dependencies.map(({ ecosystem, name, version }) => ({
        ecosystem,
        name,
        version,
      })),
    });

    const [first] = res.json().objects as Record<string, unknown>[];
    expect(Object.keys(first ?? {})).toEqual([
      'id',
      'kind',
      'source',
      'sourceKind',
      'trust',
      'title',
      'summary',
      'aliases',
      'severity',
      'cvss',
      'affected',
      'gameEngines',
      'url',
      'publishedAt',
      'modifiedAt',
      'ingestedAt',
    ]);
    expect(res.body).not.toContain('null');
  });
});
