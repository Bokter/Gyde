import { createHash } from 'node:crypto';

import type { KeyHasher } from '../application/ports/key-hasher';

export class Sha256KeyHasher implements KeyHasher {
  hash(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }
}
