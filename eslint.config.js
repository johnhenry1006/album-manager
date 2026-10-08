import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import node from 'eslint-plugin-n';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';

const javascriptFiles = ['**/*.{js,jsx,mjs,cjs}'];
const nodeFiles = ['*.{js,mjs,cjs}', 'apps/api/**/*.js', 'apps/web/*.js', 'infrastructure/**/*.js'];

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.cache/**',
      '.git/**',
      '.agents/**',
      '.codex/**',
      '.aws/**',
      '**/uploads/**',
      '**/storage-data/**',
    ],
  },
  {
    ...js.configs.recommended,
    files: javascriptFiles,
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    plugins: { 'simple-import-sort': simpleImportSort, 'unused-imports': unusedImports },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          args: 'after-used',
          argsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'simple-import-sort/imports': [
        'error',
        {
          groups: [['^\\u0000'], ['^node:'], ['^@?\\w'], ['^(?:@/|#)'], ['^\\.']],
        },
      ],
      'simple-import-sort/exports': 'error',
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },
  {
    ...node.configs['flat/recommended-module'],
    files: nodeFiles,
    languageOptions: { globals: globals.node },
    rules: {
      ...node.configs['flat/recommended-module'].rules,
      'n/prefer-node-protocol': 'error',
    },
  },
  {
    files: ['*.{js,mjs,cjs}', 'apps/web/*.js', 'infrastructure/**/*.js'],
    rules: { 'n/no-unpublished-import': 'off' },
  },
  {
    files: ['apps/web/src/**/*.{js,jsx}'],
    languageOptions: { globals: globals.browser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  prettier,
];
