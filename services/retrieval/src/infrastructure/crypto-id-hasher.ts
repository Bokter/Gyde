import { createHash } from 'node:crypto';

import type { IdHasher } from '../domain/ports';

/** Adapter of the `IdHasher` port over `node:crypto`. */
export class CryptoIdHasher implements IdHasher {
  sha256Hex(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }
}
