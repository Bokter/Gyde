import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Each in-memory PostgreSQL (PGlite) takes a moment to start. Test files start several at once,
  // so on a loaded machine or in Docker (`--target check`) the first start can be slow.
  test: { testTimeout: 90_000, hookTimeout: 90_000 },
});
