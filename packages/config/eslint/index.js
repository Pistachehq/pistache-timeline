// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Creates the shared flat ESLint configuration used by every workspace package.
 *
 * @param {object} options
 * @param {string} options.tsconfigRootDir Directory of the package (usually `import.meta.dirname`).
 * @param {boolean} [options.react] Enables React and hooks rules.
 * @param {boolean} [options.browser] Adds browser globals (implied by `react`).
 * @param {boolean} [options.node] Adds Node.js globals.
 * @param {string[]} [options.ignores] Additional ignore globs.
 */
export function createConfig({
  tsconfigRootDir,
  react = false,
  browser = react,
  node = false,
  ignores = [],
}) {
  return tseslint.config(
    {
      ignores: [
        'dist/**',
        'dist-electron/**',
        'release/**',
        'coverage/**',
        'playwright-report/**',
        'test-results/**',
        ...ignores,
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        ecmaVersion: 2023,
        globals: {
          ...globals.es2023,
          ...(browser ? globals.browser : {}),
          ...(node ? globals.node : {}),
        },
        parserOptions: {
          projectService: {
            allowDefaultProject: ['*.js', '*.mjs', 'scripts/*.mjs'],
          },
          tsconfigRootDir,
        },
      },
      rules: {
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/no-misused-promises': [
          'error',
          { checksVoidReturn: { attributes: false } },
        ],
        '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
        eqeqeq: ['error', 'always', { null: 'ignore' }],
        'no-console': ['warn', { allow: ['warn', 'error'] }],
      },
    },
    ...(react
      ? [
          {
            files: ['**/*.tsx', '**/*.ts'],
            plugins: {
              'react-hooks': reactHooks,
              'react-refresh': reactRefresh,
            },
            rules: {
              ...reactHooks.configs.recommended.rules,
              'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
            },
          },
        ]
      : []),
    {
      files: ['**/*.js', '**/*.mjs'],
      ...tseslint.configs.disableTypeChecked,
    },
    {
      files: ['**/*.test.ts', '**/*.test.tsx'],
      rules: {
        '@typescript-eslint/unbound-method': 'off',
      },
    },
    prettier,
  );
}
