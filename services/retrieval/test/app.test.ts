import { HEADERS } from '@gyde/contracts';
import { PLAN_CATALOG } from '@gyde/contracts';
import { sampleAnalysisRequest } from '@gyde/contracts/samples';
import { createLogger } from '@gyde/service-kit';
import { afterAll, describe, expect, it } from 'vitest';

import { configSchema } from '../src/config';
import { createApp } from '../src/http/app';

const token = 'test-internal-token-123456';
const config = configSchema.parse({ INTERNAL_SERVICE_TOKEN: token });
const app = await createApp({
  config,
  logger: createLogger({ name: 'retrieval-test', level: 'silent' }),
});
const auth = { [HEADERS.internalToken]: token };

afterAll(() => app.close());

describe('retrieval skeleton', () => {
  it('is alive', async () => {
    expect((await app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
  });

  it('refuses /internal calls without the token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/retrieve',
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('validates the retrieve request and answers 501 until implemented', async () => {
    const invalid = await app.inject({
      method: 'POST',
      url: '/internal/retrieve',
      headers: auth,
      payload: { nope: true },
    });
    expect(invalid.statusCode).toBe(400);

    const valid = await app.inject({
      method: 'POST',
      url: '/internal/retrieve',
      headers: auth,
      payload: {
        analysisId: 'analysis-1',
        tenantId: 'tenant-1',
        entitlements: PLAN_CATALOG.pro,
        request: sampleAnalysisRequest,
      },
    });
    expect(valid.statusCode).toBe(501);
  });
});
