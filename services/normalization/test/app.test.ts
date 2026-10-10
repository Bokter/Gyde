import { fileURLToPath } from 'node:url';

import { HEADERS, IngestResult, KnowledgeQueryResult, SourcesStatus } from '@gyde/contracts';
import { sampleAnalysisRequest } from '@gyde/contracts/samples';
import { createLogger } from '@gyde/service-kit';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { configSchema } from '../src/config';
import { createApp } from '../src/http/app';
import { createPgliteDatabase } from './support/pglite';

const token = 'test-internal-token-123456';
const fixturesDir = fileURLToPath(new URL('../../../fixtures/sources', import.meta.url));
const config = configSchema.parse({
  INTERNAL_SERVICE_TOKEN: token,
  INGEST_FIXTURES_DIR: fixturesDir,
});
const auth = { [HEADERS.internalToken]: token };
const logger = createLogger({ name: 'normalization-test', level: 'silent' });

// With fixtures the service must not use the network: any fetch is a test failure.
const fetchSpy = vi.fn(() => Promise.reject(new Error('the network must not be touched')));
vi.stubGlobal('fetch', fetchSpy);

const app = await createApp({ config, logger, database: createPgliteDatabase() });

afterAll(() => app.close());

const post = (url: string, payload?: unknown) =>
  app.inject({ method: 'POST', url, headers: auth, payload: payload as object });

describe('service basics', () => {
  it('is alive and uses fixtures by default', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(config.INGEST_USE_FIXTURES).toBe(true);
  });

  it('refuses /internal calls without the token, including unknown paths', async () => {
    for (const [method, url] of [
      ['GET', '/internal/sources'],
      ['POST', '/internal/knowledge/query'],
      ['POST', '/internal/ingest/osv'],
      ['GET', '/internal/nope'],
    ] as const) {
      const res = await app.inject({ method, url });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });
});

describe('GET /readyz', () => {
  it('is ready while the database answers', async () => {
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ready', checks: { database: 'ok' } });
  });

  it('answers 503 while the database is unreachable', async () => {
    const broken = { ...createPgliteDatabase(), ping: () => Promise.reject(new Error('down')) };
    const unready = await createApp({ config, logger, database: broken });
    try {
      const res = await unready.inject({ method: 'GET', url: '/readyz' });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toMatchObject({ status: 'not_ready', checks: { database: 'failed' } });
      // Liveness is independent: the process is up even though it cannot serve knowledge.
      expect((await unready.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
    } finally {
      await unready.close();
    }
  });
});

describe('knowledge API over the fixtures', () => {
  it('reports every source as never ingested before the first run', async () => {
    const res = await app.inject({ method: 'GET', url: '/internal/sources', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(SourcesStatus.parse(res.json()).sources).toEqual([
      { name: 'osv', kind: 'structured', trust: 'high', status: 'never' },
    ]);
  });

  it('answers an empty list when nothing is stored yet', async () => {
    const res = await post('/internal/knowledge/query', {
      packages: [{ ecosystem: 'nuget', name: 'Acme.Serialization', version: '1.4.0' }],
    });
    expect(res.statusCode).toBe(200);
    expect(KnowledgeQueryResult.parse(res.json()).objects).toEqual([]);
  });

  it('rejects an invalid query with 400', async () => {
    expect((await post('/internal/knowledge/query', { packages: [] })).statusCode).toBe(400);
    expect((await post('/internal/knowledge/query', {})).statusCode).toBe(400);
  });

  it('POST /internal/ingest/:source stores the fixtures of that source', async () => {
    const res = await post('/internal/ingest/osv');

    expect(res.statusCode).toBe(200);
    expect(IngestResult.parse(res.json())).toMatchObject({
      source: 'osv',
      recordsProcessed: 3,
      recordsSkipped: 0,
    });
  });

  it('POST /internal/knowledge/query returns the objects that mention the requested packages', async () => {
    const res = await post('/internal/knowledge/query', {
      packages: sampleAnalysisRequest.dependencies.map(({ ecosystem, name, version }) => ({
        ecosystem,
        name,
        version,
      })),
    });

    expect(res.statusCode).toBe(200);
    const { objects } = KnowledgeQueryResult.parse(res.json());
    // SAMPLE-0003 is a candidate too: it mentions Acme.Serialization although 1.4.0 is outside its
    // range. Crossing versions is Retrieval's job. SAMPLE-0002 is about another package.
    expect(objects.map((object) => object.id)).toEqual(['osv:SAMPLE-0001', 'osv:SAMPLE-0003']);
  });

  it('GET /internal/sources reports the last ingestion time and status per source', async () => {
    const res = await app.inject({ method: 'GET', url: '/internal/sources', headers: auth });

    const [osv] = SourcesStatus.parse(res.json()).sources;
    expect(osv).toMatchObject({ name: 'osv', status: 'ok' });
    expect(osv?.lastIngestedAt).toBeDefined();
    expect(osv?.lastAttemptAt).toBeDefined();
    expect(osv).not.toHaveProperty('lastError');
  });

  it('re-ingesting changes nothing: the same objects, never duplicated', async () => {
    const query = {
      packages: [{ ecosystem: 'nuget', name: 'Acme.Serialization', version: '1.4.0' }],
    };
    const before = KnowledgeQueryResult.parse(
      (await post('/internal/knowledge/query', query)).json(),
    );

    expect((await post('/internal/ingest/osv')).statusCode).toBe(200);
    const after = KnowledgeQueryResult.parse(
      (await post('/internal/knowledge/query', query)).json(),
    );

    expect(after).toEqual(before);
  });

  it('answers 404 for a source that does not exist', async () => {
    const res = await post('/internal/ingest/nope');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'not_found' } });
  });

  it('never touched the network (INGEST_USE_FIXTURES=true)', () => {
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

/** Acceptance criteria that depend on pieces still to come. Turn each one into a test as you build it. */
describe('normalization behavior still to implement', () => {
  it.todo('NVD and GHSA adapters ingest their fixtures with the same normalized shape');
  it.todo('official adapter ingests engine changelogs/docs (Unity first, Unreal as a skeleton)');
  it.todo('community adapter ingests GitHub Issues, marks them low trust and filters them lightly');
  it.todo('high-trust sources refresh on INGEST_HIGH_TRUST_CRON, community on its own cadence');
});
