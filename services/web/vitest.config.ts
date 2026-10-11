import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Same alias as tsconfig.json, so tests can import route handlers and lib helpers.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
