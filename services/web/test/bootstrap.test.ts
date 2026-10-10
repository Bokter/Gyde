import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');

describe('web bootstrap', () => {
  it('should have package.json with required scripts', async () => {
    const pkg = await import('../package.json', { assert: { type: 'json' } });
    expect(pkg.default.scripts).toHaveProperty('dev');
    expect(pkg.default.scripts).toHaveProperty('build');
    expect(pkg.default.scripts).toHaveProperty('start');
    expect(pkg.default.scripts).toHaveProperty('typecheck');
    expect(pkg.default.scripts).toHaveProperty('lint');
    expect(pkg.default.scripts).toHaveProperty('test');
  });

  it('should have next.config.ts with standalone output', async () => {
    const fs = await import('fs/promises');
    const config = await fs.readFile(path.join(webRoot, 'next.config.ts'), 'utf-8');
    expect(config).toContain("output: 'standalone'");
  });

  it('should have globals.css importing design tokens', async () => {
    const fs = await import('fs/promises');
    const css = await fs.readFile(path.join(webRoot, 'src/app/globals.css'), 'utf-8');
    expect(css).toContain("@import '@gyde/design-tokens/css'");
  });

  it('should have fonts configuration', async () => {
    const fs = await import('fs/promises');
    const fonts = await fs.readFile(path.join(webRoot, 'src/lib/fonts.ts'), 'utf-8');
    expect(fonts).toContain('Bricolage_Grotesque');
    expect(fonts).toContain('Figtree');
    expect(fonts).toContain('JetBrains_Mono');
  });
});
