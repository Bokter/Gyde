import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  sourcemap: true,
  clean: true,
  // Workspace packages ship as TypeScript source: bundle them. npm dependencies stay external,
  // which is why fastify, pino and zod are declared in this package.json.
  noExternal: [/^@gyde\//],
});
