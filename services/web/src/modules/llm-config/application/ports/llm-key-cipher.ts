import type { EncryptedSecret } from '../../domain/entities';

/**
 * Encrypts the studio's key at rest. `associatedData` (the tenant id) is authenticated but not
 * stored: a ciphertext moved to another tenant's row no longer decrypts.
 */
export interface LlmKeyCipher {
  encrypt(plaintext: string, associatedData: string): EncryptedSecret;
  /** Uses the `kid` stored with the secret, so keys written before a rotation still decrypt. */
  decrypt(secret: EncryptedSecret, associatedData: string): string;
}
