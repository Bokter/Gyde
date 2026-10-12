import { defineConfig } from 'tsup';

export default defineConfig({
  // GitHub runs `dist/index.js` straight from the repository, with no node_modules:
  // everything must be bundled, and the dist folder is committed on release.
  entry: { index: 'src/main.ts' },
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  sourcemap: false,
  clean: true,
  noExternal: [/.*/],
  // Bundled CommonJS dependencies (`tunnel`, under @actions/http-client) call `require` for Node
  // built-ins, which an ES module does not have.
  banner: {
    js: "import { createRequire as __gydeCreateRequire } from 'node:module'; const require = __gydeCreateRequire(import.meta.url);",
  },
});
