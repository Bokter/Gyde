import { HttpError } from '@gyde/service-kit';
import { describe, expect, it } from 'vitest';

import { GatewayError, PlanLimitExceededError, UnauthorizedError } from '../src/application/errors';
import { AuthenticateApiKey } from '../src/application/authenticate-api-key';
import { SubmitAnalysis } from '../src/application/submit-analysis';
import { translateApplicationError } from '../src/http/application-error.interceptor';
import { MemoryAuthCache } from '../src/infrastructure/memory-auth-cache';
import { MemoryUsageCounter } from '../src/infrastructure/memory-usage-counter';
import { Sha256KeyHasher } from '../src/infrastructure/sha256-key-hasher';
import { VALID_KEY, validVerification } from './helpers';

describe('application errors', () => {
  it('carry a stable code and no HTTP status', () => {
    const unauthorized = new UnauthorizedError();
    expect(unauthorized).toBeInstanceOf(GatewayError);
    expect(unauthorized).toMatchObject({
      code: 'unauthorized',
      name: 'UnauthorizedError',
      message: 'Missing or invalid API key',
    });
    expect('status' in unauthorized).toBe(false);

    const limit = new PlanLimitExceededError('free', 2);
    expect(limit).toBeInstanceOf(GatewayError);
    expect(limit.code).toBe('plan_limit_exceeded');
    expect(limit.message).toBe(
      'The free plan allows 2 analyses per month and this tenant has used them',
    );
  });
});

describe('translateApplicationError', () => {
  it('turns each application error into the HttpError the service always answered', () => {
    expect(translateApplicationError(new UnauthorizedError())).toMatchObject({
      name: 'HttpError',
      code: 'unauthorized',
      status: 401,
      message: 'Missing or invalid API key',
    });
    expect(translateApplicationError(new PlanLimitExceededError('pro', 500))).toMatchObject({
      code: 'plan_limit_exceeded',
      status: 402,
      message: 'The pro plan allows 500 analyses per month and this tenant has used them',
    });
    expect(translateApplicationError(new GatewayError('other', 'secret detail'))).toMatchObject({
      code: 'internal',
      status: 500,
      message: 'Internal server error',
    });
  });

  it('leaves any other error untouched', () => {
    const upstream = new HttpError(
      'upstream_unavailable',
      'The service is temporarily unavailable',
    );
    const unknown = new TypeError('boom');
    expect(translateApplicationError(upstream)).toBe(upstream);
    expect(translateApplicationError(unknown)).toBe(unknown);
  });
});

describe('use cases raise application errors, not HTTP ones', () => {
  it('AuthenticateApiKey refuses a malformed, missing or rejected key', async () => {
    let verifyCalls = 0;
    const authenticate = new AuthenticateApiKey({
      verifier: {
        verify: async () => {
          verifyCalls += 1;
          return { valid: false, reason: 'revoked' };
        },
      },
      hasher: new Sha256KeyHasher(),
      cache: new MemoryAuthCache({ ttlMs: 1000 }),
    });

    await expect(authenticate.execute(undefined, { requestId: 'r' })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    await expect(authenticate.execute('short', { requestId: 'r' })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(verifyCalls).toBe(0);
    await expect(authenticate.execute(VALID_KEY, { requestId: 'r' })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(verifyCalls).toBe(1);
  });

  it('SubmitAnalysis raises PlanLimitExceededError before calling Reports', async () => {
    let reportsCalls = 0;
    const submit = new SubmitAnalysis({
      reports: {
        createAnalysis: async () => {
          reportsCalls += 1;
          return { analysisId: 'a', status: 'pending' };
        },
      },
      usage: new MemoryUsageCounter(),
      now: () => Date.parse('2026-10-18T00:00:00Z'),
    });
    const principal = {
      tenantId: 't',
      apiKeyId: 'k',
      entitlements: validVerification.valid
        ? { ...validVerification.entitlements, limits: { analysesPerMonth: 1, projects: 1 } }
        : (undefined as never),
    };
    const request = {} as never;

    await submit.execute(principal, request, { requestId: 'r' });
    await expect(submit.execute(principal, request, { requestId: 'r' })).rejects.toThrow(
      new PlanLimitExceededError('pro', 1),
    );
    expect(reportsCalls).toBe(1);
  });
});
