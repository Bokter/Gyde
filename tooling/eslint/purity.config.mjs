/**
 * Strict layer purity rules for the Clean Architecture refactor (see ADR 0012 and
 * context/refactor/CONVENTIONS.md, section 1).
 *
 * NOT wired into `pnpm lint` until WP-3. Run it per service:
 *   pnpm exec eslint --config tooling/eslint/purity.config.mjs services/<svc>/src
 *
 *   domain/       relative imports only (no @gyde/*, zod, node:*, third-party libraries).
 *   application/  no zod, service-kit, resilience, discovery, @nestjs/*, node:*, nor
 *                 infrastructure/ or http/; `import type` from @gyde/contracts is tolerated
 *                 (only allowlisted pass-through use cases may use it, see the service README).
 */
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const SERVICES = 'services/{gateway,registry,retrieval,normalization,llm-analysis,reports}/src';

const OUTER_LAYERS = [
  {
    group: ['**/infrastructure', '**/infrastructure/**'],
    message: 'application cannot depend on infrastructure/.',
  },
  { group: ['**/http', '**/http/**'], message: 'application cannot depend on http/.' },
];

export default defineConfig([
  globalIgnores(['**/node_modules/**', '**/dist/**']),
  {
    languageOptions: {
      parser: tseslint.parser,
      globals: globals.node,
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
  },
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
            // Values are forbidden; `import type` is the allowlisted pass-through exception.
            { name: '@gyde/contracts', allowTypeImports: true },
          ],
          patterns: [
            ...OUTER_LAYERS,
            { group: ['@nestjs/*'], message: 'application cannot depend on NestJS.' },
            { regex: '^node:', message: 'application cannot depend on node:* modules.' },
          ],
        },
      ],
    },
  },
]);
