#!/usr/bin/env node
// Creates `.env` from `.env.example` with freshly generated local secrets.
// It never overwrites an existing `.env`.
//
//   node infra/scripts/bootstrap-env.mjs
//   docker run --rm -v "$PWD":/work -w /work node:24-alpine node infra/scripts/bootstrap-env.mjs

import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const examplePath = join(root, '.env.example');
const envPath = join(root, '.env');

if (existsSync(envPath)) {
  console.log('.env already exists: nothing to do (delete it first to generate a new one).');
  process.exit(0);
}

const hex = () => randomBytes(32).toString('hex');
const replacements = {
  INTERNAL_SERVICE_TOKEN: hex(),
  AUTH_SECRET: hex(),
  LLM_KEY_ENCRYPTION_KEYS: `k1:${randomBytes(32).toString('base64')}`,
};

const lines = readFileSync(examplePath, 'utf8')
  .split('\n')
  .map((line) => {
    const [key] = line.split('=', 1);
    return key in replacements ? `${key}=${replacements[key]}` : line;
  });

writeFileSync(envPath, lines.join('\n'), { mode: 0o600 });
console.log(
  'Created .env with generated INTERNAL_SERVICE_TOKEN, AUTH_SECRET and LLM_KEY_ENCRYPTION_KEYS.',
);
console.log('Fill in GITHUB_CLIENT_ID/SECRET and your Stripe TEST keys when you need them.');
