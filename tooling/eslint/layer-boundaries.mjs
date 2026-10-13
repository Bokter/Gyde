/**
 * Clean-architecture layer rules (see CONTRIBUTING.md, section 5).
 *
 * Dependencies point inwards:
 *   http -> application -> domain
 *   infrastructure -> application
 * `main.ts` (composition root) is the only file allowed to wire implementations.
 */

const INFRASTRUCTURE_LIBS = [
  'fastify',
  'fastify/*',
  '@fastify/*',
  'next',
  'next/*',
  'react',
  'react-dom',
  'pg',
  'postgres',
  'drizzle-orm',
  'drizzle-orm/*',
  'stripe',
  'ai',
  '@ai-sdk/*',
  'undici',
  'axios',
];

// Layer roots: every backend service, plus each feature module of the web service.
const ROOTS = ['services/*/src', 'services/web/src/modules/*'];

const importsOf = (layer) => [`**/${layer}`, `**/${layer}/**`];
const filesOf = (layer) => ROOTS.map((root) => `${root}/${layer}/**/*.{ts,tsx}`);

function restrict(layer, forbiddenLayers, message, { forbidLibs = false } = {}) {
  const patterns = [{ group: forbiddenLayers.flatMap(importsOf), message }];
  if (forbidLibs) {
    patterns.push({
      group: INFRASTRUCTURE_LIBS,
      message:
        'Infrastructure libraries are not allowed in this layer: expose a port in application/ and implement it in infrastructure/.',
    });
  }
  return {
    name: `gyde/layers/${layer}`,
    files: filesOf(layer),
    rules: { 'no-restricted-imports': ['error', { patterns }] },
  };
}

export const layerBoundaries = [
  restrict(
    'domain',
    ['application', 'infrastructure', 'http'],
    'domain must stay pure: it cannot depend on outer layers.',
    { forbidLibs: true },
  ),
  restrict(
    'application',
    ['infrastructure', 'http'],
    'application depends only on domain and on ports it defines itself.',
    { forbidLibs: true },
  ),
  restrict('infrastructure', ['http'], 'infrastructure must not depend on the http layer.'),
  restrict(
    'http',
    ['infrastructure'],
    'http talks to use cases; concrete implementations are wired in main.ts.',
  ),
];
