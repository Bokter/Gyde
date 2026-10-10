import { HEADERS } from '@gyde/contracts';
import { createLogger } from '@gyde/service-kit';
import { afterAll, describe, expect, it } from 'vitest';

import { configSchema } from '../src/config';
import { createApp } from '../src/http/app';

const token = 'test-internal-token-123456';
const config = configSchema.parse({ INTERNAL_SERVICE_TOKEN: token });
const app = await createApp({
  config,
  logger: createLogger({ name: 'normalization-test', level: 'silent' }),
});
const auth = { [HEADERS.internalToken]: token };

afterAll(() => app.close());

describe('normalization skeleton', () => {
  it('is alive and uses fixtures by default', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(config.INGEST_USE_FIXTURES).toBe(true);
  });

  it('refuses /internal calls without the token', async () => {
    const res = await app.inject({ method: 'GET', url: '/internal/sources' });
    expect(res.statusCode).toBe(401);
  });

  it('validates the knowledge query and answers 501 until implemented', async () => {
    const invalid = await app.inject({
      method: 'POST',
      url: '/internal/knowledge/query',
      headers: auth,
      payload: { packages: [] },
    });
    expect(invalid.statusCode).toBe(400);

    const valid = await app.inject({
      method: 'POST',
      url: '/internal/knowledge/query',
      headers: auth,
      payload: { packages: [{ ecosystem: 'nuget', name: 'Acme.Serialization', version: '1.4.0' }] },
    });
    expect(valid.statusCode).toBe(501);
  });
});

/** Acceptance criteria for Area 3. Turn each `it.todo` into a real test as you build it. */
describe('normalization behavior still to implement', () => {
  it.todo('OSV adapter ingests the advisories in fixtures/sources/osv into KnowledgeObjects');
  it.todo('NVD and GHSA adapters ingest their fixtures with the same normalized shape');
  it.todo('official adapter ingests engine changelogs/docs (Unity first, Unreal as a skeleton)');
  it.todo('community adapter ingests GitHub Issues, marks them low trust and filters them lightly');
  it.todo('every normalized object validates against the KnowledgeObject contract');
  it.todo('ingestion is idempotent: re-ingesting a record updates it, it never duplicates');
  it.todo('high-trust sources refresh on INGEST_HIGH_TRUST_CRON, community on its own cadence');
  it.todo('a source that is down does not stop the others and stale knowledge keeps being served');
  it.todo('POST /internal/knowledge/query returns objects that mention the requested packages');
  it.todo('GET /internal/sources reports last ingestion time and status per source');
  it.todo('INGEST_USE_FIXTURES=true never touches the network');
});
