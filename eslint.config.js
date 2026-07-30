// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import storybook from 'eslint-plugin-storybook';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const reactHooksPlugin = require('eslint-plugin-react-hooks');
const reactPlugin = require('eslint-plugin-react');
const nextPlugin = require('@next/eslint-plugin-next');

// ---------------------------------------------------------------------------
// Module boundary helpers
//
// Rule: app/, components/, and hooks/ must only import lib modules via their
// public barrel (e.g. `@/lib/polling`, not `@/lib/polling/backoff`).
// Contracts/ internals must never be imported from TypeScript source.
// ---------------------------------------------------------------------------

/**
 * Builds a `no-restricted-imports` patterns entry that forbids deep imports
 * into a given lib module (anything beyond the barrel index).
 *
 * Allowed : import { x } from '@/lib/polling'
 * Forbidden: import { x } from '@/lib/polling/backoff'
 */
function deepLibPattern(module) {
  return {
    group: [`@/lib/${module}/**`],
    message: `Import from '@/lib/${module}' barrel instead of a deep path. See docs/code-organization.md.`,
  };
}

/** All lib modules that have an enforced public barrel. */
const BOUNDARY_MODULES = [
  'api-keys',
  'api-versioning',
  'cache',
  'clients',
  'db',
  'di',
  'events',
  'feature-flags',
  'geo',
  'graphql',
  'ledger',
  'middleware',
  'notifications',
  'offramp',
  'onramp',
  'payroll',
  'polling',
  'refund',
  'repositories',
  'security',
  'services',
  'stellar',
  'validators',
  'wallets',
  'webhook',
];

const BOUNDARY_PATTERNS = [
  // Deep lib module imports
  ...BOUNDARY_MODULES.map(deepLibPattern),

  // Contract internals must never be imported from TypeScript
  {
    group: ['**/contracts/**'],
    message:
      'Do not import Rust contract internals from TypeScript. Use generated bindings only.',
  },
];

export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'public/sw.js'],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      '@next/next': nextPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      '@typescript-eslint': tsPlugin,
    },
    settings: {
      react: {
        version: 'detect',
      },
      next: {
        rootDir: resolve(__dirname),
      },
    },
    rules: {
      ...reactPlugin.configs.flat.recommended.rules,
      ...reactPlugin.configs.flat['jsx-runtime'].rules,
      ...reactHooksPlugin.configs['recommended-latest'].rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'react/no-unknown-property': 'off',
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
      '@next/next/no-img-element': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
      // Enforce no unused variables project-wide.
      // Convention: prefix intentionally-unused params/vars with _ to suppress.
      'no-unused-vars': 'off', // disabled in favour of the TS-aware rule below
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          vars: 'all',
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'no-console': 'warn',
    },
  },

  // ---------------------------------------------------------------------------
  // Module boundary enforcement
  //
  // Applies to the three consumer layers: app, components, hooks.
  // Each layer may only import from a lib module's public barrel, never from
  // internal sub-paths. This prevents accidental coupling to implementation
  // details and keeps the contract layer fully isolated.
  // ---------------------------------------------------------------------------
  {
    files: [
      'src/app/**/*.{ts,tsx}',
      'src/components/**/*.{ts,tsx}',
      'src/hooks/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: BOUNDARY_PATTERNS,
        },
      ],
    },
  },
];
