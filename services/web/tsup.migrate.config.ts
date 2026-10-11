export default {
  entry: ['src/infrastructure/db/migrate.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist/migrate',
  platform: 'node',
  dts: false,
  sourcemap: false,
  clean: true,
  external: ['pg'],
};
