// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist-package/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'services/**',
      'apps/mobile/ios/**',
      'apps/mobile/android/**',
      // The demo build (apps/web: npm run build:demo).
      'apps/mobile/public/demo/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
      // Fastify handlers are idiomatically async even without await.
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: [
      'apps/server/**/*.ts',
      'apps/relay/**/*.ts',
      'scripts/**/*.ts',
      'packages/**/*.ts',
      '*.config.ts',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    // Everything that renders in a browser or the phone app's web view.
    files: [
      'apps/web/**/*.{ts,tsx}',
      'apps/mobile/src/**/*.{ts,tsx}',
      'packages/ui/src/**/*.{ts,tsx}',
    ],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Raw HTML is never rendered in kchat (see SECURITY.md).',
        },
        {
          selector: "JSXAttribute[name.name='style']",
          message: 'Use Tailwind classes; inline styles break the CSP.',
        },
      ],
    },
  },
  {
    // Runs in the phone app's web view too: fetch only, no Node built-ins.
    files: ['packages/providers/src/**/*.ts'],
    ignores: ['packages/providers/src/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*'], message: 'packages/providers must run in a browser too.' },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/relay/static/**/*.js'],
    languageOptions: { globals: globals.browser, sourceType: 'script' },
  },
  {
    files: ['apps/web/public/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ['apps/web/scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
);
