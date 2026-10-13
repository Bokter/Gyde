import { defineConfig } from 'tsup';

// ESM with an explicit `.mjs` extension: the package.json that Next copies into `standalone` has
// no `"type": "module"`, so a plain `.js` ESM bundle would fail to parse there.
export default defineConfig({
  entry: ['src/infrastructure/db/migrate-cli.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist/migrate',
  outExtension: () => ({ js: '.mjs' }),
  platform: 'node',
  dts: false,
  sourcemap: false,
  clean: true,
  noExternal: ['drizzle-orm', 'drizzle-orm/pg-core'],
  external: ['pg'],
});
