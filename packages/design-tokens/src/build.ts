import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadTokens, toCss, toJson } from './tokens';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = loadTokens(join(root, 'tokens'));
const out = join(root, 'dist');

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'tokens.css'), toCss(tokens));
writeFileSync(join(out, 'tokens.json'), toJson(tokens));

process.stdout.write(
  `design-tokens: ${tokens.length} tokens -> dist/tokens.css, dist/tokens.json\n`,
);
