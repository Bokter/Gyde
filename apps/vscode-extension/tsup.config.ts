import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/extension.ts'],
  // VS Code loads extensions as CommonJS and provides the `vscode` module itself.
  format: ['cjs'],
  outExtension: () => ({ js: '.cjs' }),
  target: 'node22',
  platform: 'node',
  sourcemap: true,
  clean: true,
  external: ['vscode'],
  noExternal: [/^@gyde\//],
});
