import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Each in-memory PostgreSQL (PGlite) takes a moment to start; test files start several at once.
  test: { testTimeout: 30_000, hookTimeout: 30_000 },
});
