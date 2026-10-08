import { Writable } from 'node:stream';

import { AnalysisRequest, ApiError } from '@gyde/contracts';
import { sampleAnalysisRequest } from '@gyde/contracts/samples';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  HttpError,
  baseEnv,
  buildApp,
  createLogger,
  loadConfig,
  parseOrThrow,
  registerStubRoutes,
  requireInternalToken,
} from '../src';

const silentApp = (readiness?: Record<string, () => Promise<unknown>>) =>
  buildApp({
    name: 'test-service',
    version: '1.2.3',
    logger: createLogger({ name: 'test', level: 'silent' }),
    readiness,
  });

describe('health checks', () => {
  it('answers /healthz with the service identity', async () => {
    const app = silentApp();
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', service: 'test-service', version: '1.2.3' });
  });

  it('is ready when every check passes and 503 when one fails', async () => {
    const ok = silentApp({ db: async () => true });
    expect((await ok.inject({ method: 'GET', url: '/readyz' })).statusCode).toBe(200);

    const failing = silentApp({
      db: async () => {
        throw new Error('connection refused');
      },
    });
    const res = await failing.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: 'not_ready', checks: { db: 'failed' } });
  });
});

describe('request ids', () => {
  it('generates one and echoes an incoming one', async () => {
    const app = silentApp();
    const generated = await app.inject({ method: 'GET', url: '/healthz' });
    expect(generated.headers['x-request-id']).toBeTruthy();

    const echoed = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-request-id': 'trace-123' },
    });
    expect(echoed.headers['x-request-id']).toBe('trace-123');
  });
});

describe('error handling', () => {
  it('answers unknown routes with the standard envelope and never echoes the query string', async () => {
    const res = await silentApp().inject({ method: 'GET', url: '/nope?apiKey=leak-me' });
    expect(res.statusCode).toBe(404);
    expect(ApiError.safeParse(res.json()).success).toBe(true);
    expect(res.body).not.toContain('leak-me');
  });

  it('maps HttpError to its status and code', async () => {
    const app = silentApp();
    app.get('/limit', async () => {
      throw new HttpError('plan_limit_exceeded', 'Monthly limit reached');
    });
    const res = await app.inject({ method: 'GET', url: '/limit' });
    expect(res.statusCode).toBe(402);
    expect(res.json()).toMatchObject({ error: { code: 'plan_limit_exceeded' } });
  });

  it('turns unexpected errors into a generic 500 without leaking internals', async () => {
    const app = silentApp();
    app.get('/boom', async () => {
      throw new Error('db password is hunter2');
    });
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ error: { code: 'internal' } });
    expect(res.body).not.toContain('hunter2');
  });

  it('reports validation problems as 400 with the failing path', async () => {
    const app = silentApp();
    app.post('/echo', async (request) =>
      parseOrThrow(z.object({ name: z.string() }), request.body),
    );
    const res = await app.inject({ method: 'POST', url: '/echo', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.details).toEqual([expect.objectContaining({ path: 'name' })]);
  });

  it('rejects malformed JSON with 400', async () => {
    const app = silentApp();
    app.post('/echo', async (request) => request.body);
    const res = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{bad json',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'invalid_request' } });
  });
});

describe('internal token', () => {
  const token = 'a-long-enough-internal-token';
  const makeApp = () => {
    const app = silentApp();
    app.get('/internal/ping', { onRequest: requireInternalToken(token) }, async () => ({
      ok: true,
    }));
    return app;
  };

  it('rejects missing and wrong tokens', async () => {
    const app = makeApp();
    expect((await app.inject({ method: 'GET', url: '/internal/ping' })).statusCode).toBe(401);
    const wrong = await app.inject({
      method: 'GET',
      url: '/internal/ping',
      headers: { 'x-internal-token': 'wrong-token-with-other-length' },
    });
    expect(wrong.statusCode).toBe(401);
  });

  it('accepts the right token', async () => {
    const res = await makeApp().inject({
      method: 'GET',
      url: '/internal/ping',
      headers: { 'x-internal-token': token },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('stub routes', () => {
  const makeApp = () => {
    const app = silentApp();
    registerStubRoutes(app, [{ method: 'POST', url: '/v1/analyses', body: AnalysisRequest }]);
    return app;
  };

  it('validates the body before answering 501', async () => {
    const app = makeApp();
    const bad = await app.inject({ method: 'POST', url: '/v1/analyses', payload: { nope: true } });
    expect(bad.statusCode).toBe(400);

    const good = await app.inject({
      method: 'POST',
      url: '/v1/analyses',
      payload: sampleAnalysisRequest,
    });
    expect(good.statusCode).toBe(501);
    expect(good.json()).toMatchObject({ error: { code: 'not_implemented' } });
  });
});

describe('logger redaction (BYOK: secrets never reach the logs)', () => {
  it('censors keys, tokens and authorization headers, nested or not', () => {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const logger = createLogger({ name: 'test', level: 'info', destination });

    logger.info(
      {
        apiKey: 'sk-top-level-secret',
        llm: { provider: 'anthropic', apiKey: 'sk-nested-secret' },
        headers: { authorization: 'Bearer abc.def.ghi' },
      },
      'tenant llm config loaded',
    );

    const output = lines.join('');
    expect(output).not.toContain('sk-top-level-secret');
    expect(output).not.toContain('sk-nested-secret');
    expect(output).not.toContain('abc.def.ghi');
    expect(output).toContain('[REDACTED]');
    expect(output).toContain('anthropic');
  });
});

describe('config', () => {
  const schema = baseEnv.extend({ PORT: z.coerce.number().int().positive() });

  it('parses and applies defaults', () => {
    const config = loadConfig(schema, { PORT: '4000' });
    expect(config).toMatchObject({ PORT: 4000, NODE_ENV: 'development', LOG_LEVEL: 'info' });
  });

  it('fails fast with a readable message', () => {
    expect(() => loadConfig(schema, {})).toThrow(/Invalid environment configuration[\s\S]*PORT/);
  });
});
