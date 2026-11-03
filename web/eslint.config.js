import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['dist', 'coverage', 'src/api/schema.d.ts']),
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  reactHooks.configs.flat.recommended,
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-console': 'error',
      // API text is rendered as text, never as HTML (docs/DESIGN.md, Front-end security).
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Render API text as text. See docs/DESIGN.md, Front-end security.',
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'window',
          property: 'localStorage',
          message: 'Nothing is stored in the browser.',
        },
        {
          object: 'window',
          property: 'sessionStorage',
          message: 'Nothing is stored in the browser.',
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: 'Nothing is stored in the browser (docs/DESIGN.md).' },
        { name: 'sessionStorage', message: 'Nothing is stored in the browser (docs/DESIGN.md).' },
      ],
    },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
