import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Flat config: recommended JS + TypeScript rules for all sources
export default tseslint.config(
  { ignores: ['dist/', 'build/', 'node_modules/', 'coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['web/public/sw.js'],
    languageOptions: {
      globals: { self: 'readonly', caches: 'readonly', clients: 'readonly', fetch: 'readonly', URL: 'readonly', Response: 'readonly' },
    },
  },
);
