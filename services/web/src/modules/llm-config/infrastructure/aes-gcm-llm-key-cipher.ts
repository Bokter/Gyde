import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { EncryptedSecret } from '../domain/entities';
import type { LlmKeyCipher } from '../application/ports/llm-key-cipher';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const KID_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;

/**
 * AES-256-GCM with versioned master keys. Encrypts with the active `kid` and decrypts with the
 * `kid` stored next to each ciphertext, so adding `k2` and switching the active kid rotates
 * without re-encrypting anything up front.
 */
export class AesGcmLlmKeyCipher implements LlmKeyCipher {
  private constructor(
    private readonly keys: ReadonlyMap<string, Buffer>,
    private readonly activeKid: string,
  ) {}

  /**
   * `keys` is `LLM_KEY_ENCRYPTION_KEYS`: `kid:base64(32 bytes)` entries separated by commas.
   * Fails fast on any malformed entry; error messages name the kid, never key material.
   */
  static fromConfig(keys: string | undefined, activeKid: string | undefined): AesGcmLlmKeyCipher {
    if (!keys?.trim()) throw new Error('LLM_KEY_ENCRYPTION_KEYS is not configured');
    if (!activeKid?.trim()) throw new Error('LLM_KEY_ACTIVE_KID is not configured');

    const parsed = new Map<string, Buffer>();
    for (const entry of keys
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)) {
      const separator = entry.indexOf(':');
      const kid = separator > 0 ? entry.slice(0, separator) : '';
      if (!KID_PATTERN.test(kid)) {
        throw new Error('LLM_KEY_ENCRYPTION_KEYS has an entry without a valid kid');
      }
      const encoded = entry.slice(separator + 1);
      const key = Buffer.from(encoded, 'base64');
      if (key.length !== KEY_BYTES || key.toString('base64') !== encoded) {
        throw new Error(`LLM_KEY_ENCRYPTION_KEYS: key "${kid}" must be base64 of 32 bytes`);
      }
      if (parsed.has(kid)) throw new Error(`LLM_KEY_ENCRYPTION_KEYS: duplicated kid "${kid}"`);
      parsed.set(kid, key);
    }

    const active = activeKid.trim();
    if (!parsed.has(active)) {
      throw new Error(`LLM_KEY_ACTIVE_KID "${active}" is not in LLM_KEY_ENCRYPTION_KEYS`);
    }
    return new AesGcmLlmKeyCipher(parsed, active);
  }

  encrypt(plaintext: string, associatedData: string): EncryptedSecret {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key(this.activeKid), iv);
    cipher.setAAD(Buffer.from(associatedData, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return {
      kid: this.activeKid,
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };
  }

  decrypt(secret: EncryptedSecret, associatedData: string): string {
    const decipher = createDecipheriv(
      ALGORITHM,
      this.key(secret.kid),
      Buffer.from(secret.iv, 'base64'),
    );
    decipher.setAAD(Buffer.from(associatedData, 'utf8'));
    decipher.setAuthTag(Buffer.from(secret.authTag, 'base64'));
    try {
      return Buffer.concat([
        decipher.update(Buffer.from(secret.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // Wrong key, tampered data or another tenant's row: one generic message for all of them.
      throw new Error('LLM key could not be decrypted');
    }
  }

  private key(kid: string): Buffer {
    const key = this.keys.get(kid);
    if (!key) throw new Error(`No master key for kid "${kid}"`);
    return key;
  }
}
