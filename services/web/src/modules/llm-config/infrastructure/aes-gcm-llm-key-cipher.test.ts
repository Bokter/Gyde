import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AesGcmLlmKeyCipher } from './aes-gcm-llm-key-cipher';

const masterKey = () => randomBytes(32).toString('base64');
const STUDIO_KEY = 'sk-ant-api03-studio-secret-0123456789abcdef';
const TENANT = '22222222-2222-4222-8222-222222222222';

describe('AesGcmLlmKeyCipher', () => {
  it('produces a different ciphertext and IV every time for the same key', () => {
    const cipher = AesGcmLlmKeyCipher.fromConfig(`k1:${masterKey()}`, 'k1');

    const first = cipher.encrypt(STUDIO_KEY, TENANT);
    const second = cipher.encrypt(STUDIO_KEY, TENANT);

    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.iv).not.toBe(second.iv);
    expect(JSON.stringify(first)).not.toContain(STUDIO_KEY);
    expect(cipher.decrypt(first, TENANT)).toBe(STUDIO_KEY);
    expect(cipher.decrypt(second, TENANT)).toBe(STUDIO_KEY);
  });

  it('still decrypts with the old kid after rotating the active master key', () => {
    const k1 = masterKey();
    const beforeRotation = AesGcmLlmKeyCipher.fromConfig(`k1:${k1}`, 'k1');
    const stored = beforeRotation.encrypt(STUDIO_KEY, TENANT);

    const afterRotation = AesGcmLlmKeyCipher.fromConfig(`k1:${k1},k2:${masterKey()}`, 'k2');

    expect(afterRotation.decrypt(stored, TENANT)).toBe(STUDIO_KEY);
    expect(afterRotation.encrypt(STUDIO_KEY, TENANT).kid).toBe('k2');
  });

  it('refuses tampered data and ciphertexts moved to another tenant', () => {
    const cipher = AesGcmLlmKeyCipher.fromConfig(`k1:${masterKey()}`, 'k1');
    const stored = cipher.encrypt(STUDIO_KEY, TENANT);
    const tamperedTag = Buffer.from(stored.authTag, 'base64');
    tamperedTag.writeUInt8(tamperedTag.readUInt8(0) ^ 0xff, 0);

    expect(() =>
      cipher.decrypt({ ...stored, authTag: tamperedTag.toString('base64') }, TENANT),
    ).toThrow('LLM key could not be decrypted');
    expect(() => cipher.decrypt(stored, '33333333-3333-4333-8333-333333333333')).toThrow(
      'LLM key could not be decrypted',
    );
  });

  it('fails fast on a master key that is not 32 bytes of base64', () => {
    expect(() => AesGcmLlmKeyCipher.fromConfig('k1:REPLACE_WITH_BASE64_32_BYTES', 'k1')).toThrow(
      'must be base64 of 32 bytes',
    );
    expect(() => AesGcmLlmKeyCipher.fromConfig(`k1:${masterKey()}`, 'k2')).toThrow(
      'is not in LLM_KEY_ENCRYPTION_KEYS',
    );
  });
});
