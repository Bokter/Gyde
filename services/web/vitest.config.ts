import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Same alias as tsconfig.json, so tests can import route handlers and lib helpers.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Each in-memory PostgreSQL (PGlite) takes a moment to start. When `pnpm test` runs the whole
  // monorepo in parallel, a `beforeAll` that starts one can take longer than Vitest's 10 s default.
  test: { testTimeout: 90_000, hookTimeout: 90_000 },
});
