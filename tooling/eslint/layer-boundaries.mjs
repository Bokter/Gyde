/**
 * Clean-architecture layer rules (see CONTRIBUTING.md, section 5, and ADR 0012).
 *
 * Dependencies point inwards:
 *   http -> application -> domain
 *   infrastructure -> application
 * `app.module.ts` (with `main.ts`) is the composition root: the only place allowed to bind ports
 * to implementations. NestJS lives in `http/`, `infrastructure/` and the composition root;
 * `domain/` and `application/` stay free of the framework (see ADR 0011).
 *
 * Two sets of rules are exported:
 *   - `layerBoundaries`: layer direction and infrastructure libraries, for every service and for
 *     each feature module of the web service.
 *   - `servicePurity`: stricter rules for the six NestJS backend services (the web service is out):
 *       domain/       relative imports only (no @gyde/*, zod, node:*, third-party libraries).
 *       application/  no zod, @gyde/service-kit, @gyde/resilience, @gyde/discovery, @nestjs/*,
 *                     node:*, nor infrastructure/ or http/.
 *     `import type` from `@gyde/contracts` is tolerated in application/ (values are forbidden).
 *     The lint does NOT tell an allowed type import from an unlisted one: the allowlist of ADR 0012
 *     is enforced by the acceptance grep described there, not by this file.
 */

const INFRASTRUCTURE_LIBS = [
  '@nestjs/*',
  'reflect-metadata',
  'rxjs',
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
    'http talks to use cases; concrete implementations are bound in app.module.ts.',
  ),
];

// Backend services under the strict purity rules (the web service is excluded on purpose).
const SERVICES = 'services/{gateway,registry,retrieval,normalization,llm-analysis,reports}/src';

export const servicePurity = [
  {
    name: 'gyde/purity/domain',
    files: [`${SERVICES}/domain/**/*.ts`],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^[^.]',
              message:
                'domain only allows relative imports inside domain/ (no @gyde/*, zod, node:* or libraries).',
            },
            {
              regex: '^\\.{1,2}/(?:.*/)?(application|infrastructure|http)(/|$)',
              message: 'domain cannot depend on outer layers.',
            },
          ],
        },
      ],
    },
  },
  {
    name: 'gyde/purity/application',
    files: [`${SERVICES}/application/**/*.ts`],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            'zod',
            '@gyde/service-kit',
            '@gyde/resilience',
            '@gyde/discovery',
            {
              name: '@gyde/contracts',
              allowTypeImports: true,
              message: 'solo import type; ver ADR 0012',
            },
          ],
          patterns: [
            {
              group: ['**/infrastructure', '**/infrastructure/**'],
              message: 'application cannot depend on infrastructure/.',
            },
            { group: ['**/http', '**/http/**'], message: 'application cannot depend on http/.' },
            { group: ['@nestjs/*'], message: 'application cannot depend on NestJS.' },
            { regex: '^node:', message: 'application cannot depend on node:* modules.' },
          ],
        },
      ],
    },
  },
];
