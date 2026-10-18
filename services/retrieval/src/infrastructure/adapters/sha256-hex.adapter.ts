import { createHash } from 'node:crypto';

import type { DigestHex } from '../domain/ports';

/** `DigestHex` over `node:crypto`: sha256, lowercase hex. */
export const sha256Hex: DigestHex = (text) => createHash('sha256').update(text).digest('hex');
