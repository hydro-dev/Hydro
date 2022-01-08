const path = require('path');

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react'],
  env: {
    browser: true,
    es6: true,
    jquery: true,
    commonjs: true,
  },
  extends: ['airbnb'],
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
    window: true,
    JQuery: true,
  },
  rules: {
    '@typescript-eslint/dot-notation': 'off',
    '@typescript-eslint/no-implied-eval': 'off',
    '@typescript-eslint/no-throw-literal': 'off',
    '@typescript-eslint/return-await': 'off',

    // FIXME A bug with eslint-parser
    'template-curly-spacing': 'off',

    // Note: must disable the base rule as it can report incorrect errors
    'no-use-before-define': 'off',
    '@typescript-eslint/no-use-before-define': ['error'],
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'warn',

    '@typescript-eslint/lines-between-class-members': [
      'error',
      'always',
      { exceptAfterSingleLine: true },
    ],

    'lines-between-class-members': [
      'error',
      'always',
      { exceptAfterSingleLine: true },
    ],
    'comma-dangle': [
      'error',
      'always-multiline',
    ],
    indent: [
      'error',
      2,
      { SwitchCase: 0 },
    ],
    'max-len': ['error', 150],
    quotes: 'warn',
    'class-methods-use-this': 'off',
    'consistent-return': 'warn',
    'func-names': 'off',
    'import/first': 'off',
    'import/extensions': 'off',
    'import/no-extraneous-dependencies': 'off',
    'max-classes-per-file': 'off',
    'newline-per-chained-call': 'off',
    'no-empty': ['warn', { allowEmptyCatch: true }],
    'no-console': 'off',
    'no-continue': 'off',
    'no-mixed-operators': 'off',
    'no-multi-assign': 'off',
    'no-plusplus': 'off',
    'no-restricted-syntax': [
      'error',
      {
        selector: 'LabeledStatement',
        message: 'Labels are a form of GOTO; using them makes code confusing and hard to maintain and understand.',
      },
      {
        selector: 'WithStatement',
        message: '`with` is disallowed in strict mode because it makes code impossible to predict and optimize.',
      },
    ],
    'no-underscore-dangle': 'off',
    'no-await-in-loop': 'off',
    'no-lonely-if': 'off',
    'no-param-reassign': 'off',
    'no-script-url': 'off',
    'no-bitwise': 'off',
    'react/prefer-stateless-function': 'off',
    'react/static-property-placement': 'off',
    'react/self-closing-comp': 'off',
    'react/prop-types': 'off',
    'react/jsx-filename-extension': 'off',
    'react/jsx-one-expression-per-line': 'off',
    'react/jsx-props-no-spreading': 'off',
    'react/no-string-refs': 'off',
    'react/require-default-props': 'off',
    'react/react-in-jsx-scope': 'off',
    'react/destructuring-assignment': 'off',
    'react/button-has-type': 'off',
    'react/forbid-prop-types': 'off',
    'jsx-a11y/no-static-element-interactions': 'off',
    'jsx-a11y/anchor-is-valid': 'off',
    'jsx-a11y/click-events-have-key-events': 'off',
  },
};
