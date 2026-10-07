// @ts-check
import js from '@eslint/js';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import { defineConfig, globalIgnores } from 'eslint/config';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Files whose tooling expects a default export (Vite, Vitest, ESLint, commitlint). */
const CONFIG_FILES = ['**/*.config.{js,mjs,cjs,ts}'];
const TEST_FILES = ['**/*.test.{ts,tsx}', '**/test/**/*.{ts,tsx}'];

export default defineConfig(
  globalIgnores([
    '**/dist/',
    '**/coverage/',
    '**/.aws-sam/',
    '**/playwright-report/',
    '**/test-results/',
  ]),

  { linterOptions: { reportUnusedDisableDirectives: 'error' } },

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  eslintComments.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      // CLAUDE.md non-negotiable 6: every eslint-disable carries a same-line `-- reason`.
      '@eslint-community/eslint-comments/require-description': 'error',
      // `@ts-expect-error` is allowed only in tests, with a reason (override below).
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': true, 'ts-ignore': true, 'ts-nocheck': true },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Named exports only (SPEC §13.1).
      'no-restricted-syntax': [
        'error',
        { selector: 'ExportDefaultDeclaration', message: 'Use named exports only.' },
      ],
    },
  },

  {
    files: TEST_FILES,
    rules: {
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description', 'ts-ignore': true, 'ts-nocheck': true },
      ],
    },
  },

  { files: CONFIG_FILES, rules: { 'no-restricted-syntax': 'off' } },

  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['apps/web/**/*.tsx'],
    extends: [reactHooks.configs.flat.recommended, jsxA11y.flatConfigs.strict],
    languageOptions: { globals: globals.browser },
  },
);
