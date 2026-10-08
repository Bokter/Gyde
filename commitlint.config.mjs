// Conventional Commits, restricted to Gyde's types and scopes (see CONTRIBUTING.md, section 3).
// The same rules validate local commits (husky hook) and pull request titles (CI).
const scopes = [
  // services
  'gateway',
  'web',
  'normalization',
  'retrieval',
  'llm-analysis',
  'reports',
  'registry',
  // packages
  'contracts',
  'analysis-engine',
  'resilience',
  'discovery',
  'service-kit',
  'design-tokens',
  // apps
  'cli',
  'github-action',
  'vscode-extension',
  // cross-cutting
  'repo',
  'tooling',
  'ci',
  'infra',
  'fixtures',
  'deps',
  // documentation
  'architecture',
  'adr',
  'design',
  'tasks',
  'workflow',
  'readme',
];

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'],
    ],
    'scope-enum': [2, 'always', scopes],
    'header-max-length': [2, 'always', 100],
  },
};
