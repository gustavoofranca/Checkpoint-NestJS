import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['dist', 'coverage', 'src/generated']),
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-console': 'error',
      'no-restricted-properties': [
        'error',
        {
          property: '$queryRawUnsafe',
          message: 'Use the tagged-template $queryRaw. See docs/SECURITY.md section 3.',
        },
        {
          property: '$executeRawUnsafe',
          message: 'Use the tagged-template $executeRaw. See docs/SECURITY.md section 3.',
        },
      ],
      // Nest modules are empty classes carrying a @Module() decorator.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },
  {
    files: ['**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
