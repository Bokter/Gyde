import { VerifyApiKeyRequest } from '@gyde/contracts';
import { describe, expect, it } from 'vitest';

import { isWellFormedApiKey } from '../../src/domain/api-key-format';

describe('isWellFormedApiKey', () => {
  it('rejects a missing key', () => {
    expect(isWellFormedApiKey(undefined)).toBe(false);
  });

  it('accepts exactly the lengths 10..200', () => {
    expect(isWellFormedApiKey('k'.repeat(9))).toBe(false);
    expect(isWellFormedApiKey('k'.repeat(10))).toBe(true);
    expect(isWellFormedApiKey('k'.repeat(200))).toBe(true);
    expect(isWellFormedApiKey('k'.repeat(201))).toBe(false);
  });

  // The bounds are copied from the contract: this test fails if either side drifts.
  it('agrees with VerifyApiKeyRequest for every length from 0 to 205', () => {
    for (let length = 0; length <= 205; length += 1) {
      const apiKey = 'k'.repeat(length);
      expect(isWellFormedApiKey(apiKey), `length ${length}`).toBe(
        VerifyApiKeyRequest.safeParse({ apiKey }).success,
      );
    }
  });

  it('agrees with VerifyApiKeyRequest on characters outside the BMP', () => {
    const keys = [
      '😀'.repeat(5),
      '😀'.repeat(9),
      '😀'.repeat(10),
      '😀'.repeat(100),
      '😀'.repeat(101),
    ];
    keys.push('\ud800'.repeat(10), 'é'.repeat(10), `${'k'.repeat(9)}😀`);
    for (const apiKey of keys) {
      expect(isWellFormedApiKey(apiKey), `length ${apiKey.length}`).toBe(
        VerifyApiKeyRequest.safeParse({ apiKey }).success,
      );
    }
  });
});
