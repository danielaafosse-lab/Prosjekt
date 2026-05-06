import js from '@eslint/js';
import importX from 'eslint-plugin-import-x';
import globals from 'globals';

export default [
  js.configs.recommended,

  {
    files: ['js/**/*.js'],
    plugins: {
      'import-x': importX,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        firebase: 'readonly',
        emailjs: 'readonly',
        Chart: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-undef': 'error',
      'prefer-const': 'warn',
      'no-var': 'error',
      eqeqeq: ['warn', 'smart'],

      // Import hygiene
      'import-x/no-cycle': ['error', { maxDepth: 5 }],
      'import-x/no-self-import': 'error',
      'import-x/no-useless-path-segments': 'warn',

      // Reserved for v6 feature-folder enforcement (activated in fase 5).
      // Keeps shape ready: features can call shared/* and other features'
      // services, but never another feature's controllers/templates.
      'import-x/no-restricted-paths': 'off',
    },
  },

  {
    files: ['functions/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  {
    files: ['**/*.test.js', '**/*.spec.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },

  {
    ignores: [
      'node_modules/**',
      'css/output.css',
      '.firebase/**',
      'package-lock.json',
      'data/**',
      'docs/**',
      'public/**',
      '404.html',
    ],
  },
];
