/* eslint-disable @typescript-eslint/naming-convention */
const path = require('path');

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  env: {
    browser: true,
    es6: true,
    jquery: true,
    commonjs: true,
  },
  extends: [
    '@hydrooj/eslint-config',
  ],
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 2020,
    ecmaFeatures: {
      impliedStrict: true,
      experimentalObjectRestSpread: true,
      jsx: true,
      defaultParams: true,
      legacyDecorators: true,
      allowImportExportEverywhere: true,
    },
  },
  settings: {
    'import/resolver': {
      webpack: {
        config: {
          resolve: {
            extensions: ['.js', '.jsx', '.ts', '.tsx'],
            alias: {
              vj: path.resolve(__dirname),
            },
          },
        },
      },
    },
  },
  globals: {
    __webpack_public_path__: true,
    __webpack_require__: true,
    UiContext: true,
    UserContext: true,
    externalModules: true,
    LOCALES: true,
    LANGS: true,
    window: true,
    JQuery: true,
  },
  rules: {
    // FIXME A bug with eslint-parser
    // 'template-curly-spacing': 'off',

    '@stylistic/indent': [
      'warn',
      2,
      { SwitchCase: 1 },
    ],
    'github/array-foreach': 'off',
    'function-paren-newline': 'off',
    'no-mixed-operators': 'off',
    'no-await-in-loop': 'off',
    'no-lonely-if': 'off',
    'no-script-url': 'off',

    'simple-import-sort/imports': [
      'warn',
      {
        groups: [
          ['^\\u0000'],
          ['^(?!vj)(@?\\w.+)', '^vj\\/', '^', '^\\.'],
        ],
      },
    ],
  },
};
