import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    files: ['packages/*/src/**/*.ts', 'packages/*/src/**/*.tsx', 'packages/*/tests/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: ['./packages/*/tsconfig.json', './packages/*/tsconfig.test.json'],
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    settings: {
    },
    rules: {
      // Strict 'any' prevention
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',

      // Explicit return types for better type inference
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true
        }
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'error',

      // Type safety
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowString: false,
          allowNumber: false,
          allowNullableObject: false
        }
      ],

      // Promise handling
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',

      // Type assertions
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',

      // Modern patterns
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
    }
  },
  {
    ignores: [
      '**/dist/',
      '**/node_modules/',
      '**/*.js',
      '**/*.cjs',
      '**/*.mjs',
      '!eslint.config.js',
      'old/**/*',
      '.yarn/**/*',
      'examples/**/*'
    ]
  }
];
