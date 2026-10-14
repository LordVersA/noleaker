import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        console: 'readonly',
      },
    },
  },
  {
    files: ['tests/browser-fixtures/*.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        navigator: 'readonly',
        postMessage: 'readonly',
        onconnect: 'writable',
      },
    },
  },
  // Platform code is reached only through the build-time `@platform/*` alias, so each bundle holds
  // only its own target's code. src/shared/ is platform-free; the Chrome proxy API stays in
  // src/platform/chrome/.
  {
    files: ['src/**/*.ts'],
    ignores: ['src/platform/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: '(^|/)platform/', message: 'Import platform code through @platform/*.' },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='chrome'][property.name='proxy']",
          message: 'chrome.proxy is Chrome-only: move it to src/platform/chrome/.',
        },
        {
          selector: "MemberExpression[object.name='browser']",
          message:
            'Use the chrome.* namespace in shared code; browser.* belongs in src/platform/firefox/.',
        },
      ],
    },
  },
  {
    files: ['src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: '(^|/)platform/', message: 'Shared code must not depend on a platform.' },
            { regex: '^@platform/', message: 'Shared code must not depend on a platform.' },
          ],
        },
      ],
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
