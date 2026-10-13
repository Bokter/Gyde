import { afterEach, describe, expect, it } from 'vitest';
import { isValidInternalToken } from './internal-auth';

describe('isValidInternalToken', () => {
  afterEach(() => {
    delete process.env.INTERNAL_SERVICE_TOKEN;
  });

  it('accepts only the exact configured token', () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'test-token-1234567890123456';

    expect(isValidInternalToken('test-token-1234567890123456')).toBe(true);
    expect(isValidInternalToken(null)).toBe(false);
    expect(isValidInternalToken('')).toBe(false);
    expect(isValidInternalToken('test-token-123456789012345')).toBe(false);
    expect(isValidInternalToken('test-token-12345678901234567')).toBe(false);
  });

  it('rejects everything when INTERNAL_SERVICE_TOKEN is not configured', () => {
    expect(isValidInternalToken('any-token')).toBe(false);
    expect(isValidInternalToken(undefined)).toBe(false);
  });
});
