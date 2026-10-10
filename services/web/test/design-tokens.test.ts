import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');

describe('design tokens integration', () => {
  it('should have design-tokens as dependency', async () => {
    const pkg = await import('../package.json', { assert: { type: 'json' } });
    expect(pkg.default.dependencies['@gyde/design-tokens']).toBe('workspace:*');
  });

  it('should import design-tokens CSS in globals.css', async () => {
    const fs = await import('fs/promises');
    const css = await fs.readFile(path.join(webRoot, 'src/app/globals.css'), 'utf-8');
    expect(css).toContain("@import '@gyde/design-tokens/css'");
  });

  it('should use semantic token variables in globals.css', async () => {
    const fs = await import('fs/promises');
    const css = await fs.readFile(path.join(webRoot, 'src/app/globals.css'), 'utf-8');
    expect(css).toContain('var(--gyde-color-bg-canvas)');
    expect(css).toContain('var(--gyde-color-fg-default)');
    expect(css).toContain('var(--gyde-color-fg-brand)');
    expect(css).toContain('var(--gyde-color-focus-ring)');
    expect(css).toContain('var(--gyde-shadow-focus)');
    expect(css).toContain('var(--gyde-font-size-base)');
    expect(css).toContain('var(--gyde-font-line-height-normal)');
    expect(css).toContain('var(--gyde-font-line-height-tight)');
    expect(css).toContain('var(--gyde-font-size-sm)');
    expect(css).toContain('var(--gyde-color-bg-brand-subtle)');
  });

  it('should use semantic tokens in page.tsx', async () => {
    const fs = await import('fs/promises');
    const page = await fs.readFile(path.join(webRoot, 'src/app/page.tsx'), 'utf-8');
    expect(page).toContain('var(--gyde-color-fg-default)');
    expect(page).toContain('var(--gyde-color-fg-brand)');
    expect(page).toContain('var(--gyde-color-fg-muted)');
    expect(page).toContain('var(--gyde-color-bg-surface)');
    expect(page).toContain('var(--gyde-color-bg-brand-subtle)');
    expect(page).toContain('var(--gyde-color-action-primary-bg)');
    expect(page).toContain('var(--gyde-color-border-subtle)');
    expect(page).toContain('var(--gyde-color-border-control)');
  });
});
