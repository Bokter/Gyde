import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  sourcemap: true,
  clean: true,
  // The CLI is distributed as one self-contained file: bundle the workspace packages.
  noExternal: [/^@gyde\//],
});
