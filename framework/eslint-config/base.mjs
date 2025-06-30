import { FlatCompat } from '@eslint/eslintrc';
import eslintReact from '@eslint-react/eslint-plugin';
import stylistic from '@stylistic/eslint-plugin';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import { defineConfig, globalIgnores } from 'eslint/config';
import deMorgan from 'eslint-plugin-de-morgan';
import github from 'eslint-plugin-github';
import jsxA11Y from 'eslint-plugin-jsx-a11y';
import reactRefresh from 'eslint-plugin-react-refresh';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

const compat = new FlatCompat({});

export default defineConfig([
    globalIgnores([
        '**/*.d.ts',
        '**/node_modules',
        '**/.git',
    ]),
    {
        extends: [
            compat.extends('airbnb-base'),
            compat.extends('airbnb/hooks'),
            github.getFlatConfigs().react,
            deMorgan.configs.recommended,
            eslintReact.configs['recommended-typescript'],
        ],

        settings: {
            'import/parsers': {
                '@typescript-eslint/parser': ['.ts', '.tsx', '.d.ts'],
            },

            'import/resolver': {
                node: {
                    extensions: ['.mjs', '.js', '.json', '.ts', '.d.ts'],
                },
            },

            'import/extensions': ['.js', '.mjs', '.jsx', '.ts', '.tsx', '.d.ts'],
            'import/external-module-folders': ['node_modules', 'node_modules/@types'],
        },

        plugins: {
            '@typescript-eslint': typescriptEslint,
            'simple-import-sort': simpleImportSort,
            // import: fixupPluginRules(_import),
            'react-refresh': reactRefresh,
            'jsx-a11y': jsxA11Y,
            '@stylistic': stylistic,
        },

        languageOptions: {
            globals: {
                Atomics: 'readonly',
                SharedArrayBuffer: 'readonly',
                BigInt: 'readonly',
            },

            parser: tsParser,
        },

        rules: {
            'brace-style': 'off',

            '@stylistic/brace-style': ['error', '1tbs', {
                allowSingleLine: true,
            }],

            camelcase: 'off',
            'comma-dangle': 'off',

            '@stylistic/comma-dangle': ['error', {
                arrays: 'always-multiline',
                objects: 'always-multiline',
                imports: 'always-multiline',
                exports: 'always-multiline',
                functions: 'always-multiline',
                enums: 'always-multiline',
                generics: 'always-multiline',
                tuples: 'always-multiline',
            }],

            'comma-spacing': 'off',

            '@stylistic/comma-spacing': ['error', {
                before: false,
                after: true,
            }],

            'default-param-last': 'off',

            'func-call-spacing': 'off',
            'function-call-spacing': 'off',
            '@stylistic/function-call-spacing': ['error', 'never'],
            indent: 'off',

            '@stylistic/indent': ['warn', 4, {
                SwitchCase: 1,
                VariableDeclarator: 1,
                outerIIFEBody: 1,

                FunctionDeclaration: {
                    parameters: 1,
                    body: 1,
                },

                FunctionExpression: {
                    parameters: 1,
                    body: 1,
                },

                CallExpression: {
                    arguments: 1,
                },

                ArrayExpression: 1,
                ObjectExpression: 1,
                ImportDeclaration: 1,
                flatTernaryExpressions: false,

                ignoredNodes: [
                    'JSXElement',
                    'JSXElement > *',
                    'JSXAttribute',
                    'JSXIdentifier',
                    'JSXNamespacedName',
                    'JSXMemberExpression',
                    'JSXSpreadAttribute',
                    'JSXExpressionContainer',
                    'JSXOpeningElement',
                    'JSXClosingElement',
                    'JSXFragment',
                    'JSXOpeningFragment',
                    'JSXClosingFragment',
                    'JSXText',
                    'JSXEmptyExpression',
                    'JSXSpreadChild',
                ],

                ignoreComments: false,
            }],

            'keyword-spacing': 'off',

            '@stylistic/keyword-spacing': ['error', {
                before: true,
                after: true,

                overrides: {
                    return: {
                        after: true,
                    },

                    throw: {
                        after: true,
                    },

                    case: {
                        after: true,
                    },
                },
            }],

            'lines-between-class-members': 'off',

            '@stylistic/lines-between-class-members': ['error', 'always', {
                exceptAfterSingleLine: true,
            }],

            'no-array-constructor': 'off',
            '@typescript-eslint/no-array-constructor': 'error',
            'no-dupe-class-members': 'off',
            '@typescript-eslint/no-dupe-class-members': 'error',
            'no-empty-function': 'off',

            '@typescript-eslint/no-empty-function': ['error', {
                allow: ['arrowFunctions', 'functions', 'methods'],
            }],

            'no-extra-parens': 'off',

            '@typescript-eslint/no-extra-parens': ['off', 'all', {
                conditionalAssign: true,
                nestedBinaryExpressions: false,
                returnAssign: false,
                ignoreJSX: 'all',
                enforceForArrowConditionals: false,
            }],

            'no-extra-semi': 'off',
            '@stylistic/no-extra-semi': 'error',
            'no-new-func': 'off',
            'no-loss-of-precision': 'off',
            '@typescript-eslint/no-loss-of-precision': 'error',
            'no-loop-func': 'off',
            '@typescript-eslint/no-loop-func': 'error',
            'no-magic-numbers': 'off',

            '@typescript-eslint/no-magic-numbers': ['off', {
                ignore: [],
                ignoreArrayIndexes: true,
                enforceConst: true,
                detectObjects: false,
            }],

            'no-redeclare': 'off',
            '@typescript-eslint/no-redeclare': 'error',
            'no-shadow': 'off',
            '@typescript-eslint/no-shadow': 'error',
            'space-before-blocks': 'off',
            '@stylistic/space-before-blocks': 'error',
            'no-unused-expressions': 'off',

            '@typescript-eslint/no-unused-expressions': ['error', {
                allowShortCircuit: false,
                allowTernary: false,
                allowTaggedTemplates: false,
            }],

            'no-unused-vars': 'off',

            '@typescript-eslint/no-unused-vars': ['error', {
                vars: 'all',
                args: 'after-used',
                ignoreRestSiblings: true,
                caughtErrorsIgnorePattern: '^_|e',
                argsIgnorePattern: '^_',
            }],

            'no-use-before-define': 'off',

            '@typescript-eslint/no-use-before-define': ['error', {
                functions: true,
                classes: true,
                variables: true,
            }],

            'no-useless-constructor': 'off',
            '@typescript-eslint/no-useless-constructor': 'error',
            quotes: 'off',

            '@stylistic/quotes': ['warn', 'single', {
                avoidEscape: true,
            }],

            semi: 'off',
            '@stylistic/semi': ['error', 'always'],
            'space-before-function-paren': 'off',

            '@stylistic/space-before-function-paren': ['error', {
                anonymous: 'always',
                named: 'never',
                asyncArrow: 'always',
            }],

            'require-await': 'off',
            '@typescript-eslint/require-await': 'off',
            'space-infix-ops': 'off',
            '@stylistic/space-infix-ops': 'error',
            'object-curly-spacing': 'off',
            '@stylistic/object-curly-spacing': ['error', 'always'],

            'function-call-argument-newline': 0,

            'no-implicit-coercion': ['warn', {
                allow: ['!!', '+'],
            }],

            'no-extra-boolean-cast': ['warn', {
                enforceForLogicalOperands: true,
            }],

            'no-empty-pattern': 0,
            'no-multi-str': 0,

            'dot-notation': 0,

            '@typescript-eslint/naming-convention': [
                'warn',
                {
                    selector: 'default',
                    format: ['camelCase'],
                    leadingUnderscore: 'allowSingleOrDouble',
                }, {
                    selector: 'default',

                    filter: {
                        regex: '^([A-Z]|_+id|__call__)$',
                        match: true,
                    },

                    format: null,
                }, {
                    selector: 'variable',
                    modifiers: ['destructured'],
                    format: null,
                }, {
                    selector: 'import',
                    format: null,
                }, {
                    selector: 'variable',
                    format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
                    modifiers: ['const'],
                    leadingUnderscore: 'allowSingleOrDouble',
                }, {
                    selector: 'property',
                    format: ['camelCase', 'PascalCase', 'UPPER_CASE', 'snake_case'],
                    leadingUnderscore: 'allowSingleOrDouble',
                }, {
                    selector: ['function', 'parameter', 'parameterProperty', 'objectLiteralMethod'],

                    filter: {
                        regex: '__call__',
                        match: false,
                    },

                    format: ['camelCase', 'PascalCase'],
                    leadingUnderscore: 'allowSingleOrDouble',
                }, {
                    selector: ['objectLiteralProperty'],

                    filter: {
                        regex: '^[\\d]+$',
                        match: true,
                    },

                    format: null,
                }, {
                    selector: ['typeProperty', 'typeMethod', 'objectLiteralProperty'],
                    modifiers: ['requiresQuotes'],
                    format: null,
                }, {
                    selector: ['typeMethod'],
                    format: ['camelCase', 'PascalCase'],
                }, {
                    selector: ['enum', 'class', 'interface'],
                    format: ['PascalCase'],
                }, {
                    selector: ['typeAlias', 'enumMember', 'typeParameter'],
                    format: ['PascalCase', 'camelCase', 'UPPER_CASE'],
                },
            ],

            '@typescript-eslint/no-invalid-this': 0,

            'class-methods-use-this': 0,
            'global-require': 0,
            'guard-for-in': 0,
            'implicit-arrow-linebreak': 0,
            'import/extensions': 0,
            'import/order': 0,
            'consistent-return': 1,
            'func-names': 0,
            'import/newline-after-import': 0,
            'import/no-cycle': 0,
            'import/no-extraneous-dependencies': 0,
            'import/no-named-as-default': 0,
            'import/prefer-default-export': 0,

            'logical-assignment-operators': ['warn', 'always', {
                enforceForIfStatements: true,
            }],

            'max-classes-per-file': 0,
            'max-len': ['warn', 150],
            'newline-per-chained-call': 0,
            'no-bitwise': 0,
            'no-console': 0,
            'no-continue': 0,
            'no-extend-native': 0,

            'no-empty': ['warn', {
                allowEmptyCatch: true,
            }],

            'no-await-in-loop': 1,
            'no-multi-assign': 0,
            'no-return-await': 0,
            'no-nested-ternary': 0,
            'no-param-reassign': 0,
            'no-plusplus': 0,
            'no-underscore-dangle': 0,
            'no-unmodified-loop-condition': 1,
            'prefer-destructuring': 0,
            'function-paren-newline': 0,
            'simple-import-sort/exports': 0,

            'no-restricted-syntax': [
                'error', {
                    selector: 'LabeledStatement',
                    message: 'Labels are a form of GOTO; using them makes code confusing and hard to maintain and understand.',
                }, {
                    selector: 'WithStatement',
                    message: '`with` is disallowed in strict mode because it makes code impossible to predict and optimize.',
                },
            ],

            'generator-star-spacing': 0,

            'github/array-foreach': 1,
            'github/a11y-svg-has-accessible-name': 0,
            'quote-props': 0,
            '@stylistic/quote-props': [0, 'as-needed'],

            'simple-import-sort/imports': ['warn', {
                groups: [
                    ['^\\u0000'],
                    [
                        // eslint-disable-next-line max-len
                        '^(node:)?(assert|buffer|child_process|cluster|console|constants|crypto|dgram|dns|domain|events|fs|http|https|module|net|os|path|punycode|querystring|readline|repl|stream|string_decoder|sys|timers|tls|tty|url|util|vm|zlib|freelist|v8|process|async_hooks|http2|perf_hooks)(/.*|$)',
                        '^',
                        '^\\.',
                    ],
                ],
            }],

            // ui-default is currently on react 18
            '@eslint-react/no-prop-types': 0,
            '@eslint-react/no-string-refs': 0,

            // to allow `javascript:;`
            '@eslint-react/dom/no-script-url': 0,

            '@eslint-react/no-array-index-key': 0,
            '@eslint-react/dom/no-missing-button-type': 0,
            '@eslint-react/dom/no-dangerously-set-innerhtml': 0,
            '@eslint-react/hooks-extra/no-direct-set-state-in-use-effect': 0,
            '@eslint-react/hooks-extra/no-unnecessary-use-prefix': 0,
            'react-hooks/exhaustive-deps': 0,
            // 'react/prefer-stateless-function': 0,
            // 'react/function-component-definition': 0,
            // 'react/static-property-placement': 0,
            // 'react/self-closing-comp': 0,
            // 'react/prop-types': 0,
            // 'react/jsx-filename-extension': 0,
            // 'react/jsx-one-expression-per-line': 0,
            // 'react/jsx-props-no-spreading': 0,
            // 'react/no-string-refs': 0,
            // 'react/require-default-props': 0,
            // 'react/react-in-jsx-scope': 0,
            // 'react/destructuring-assignment': 0,
            // 'react/button-has-type': 0,
            // 'react/forbid-prop-types': 0,
            'jsx-a11y/no-static-element-interactions': 0,
            'jsx-a11y/anchor-is-valid': 0,
            'jsx-a11y/click-events-have-key-events': 0,
            'jsx-a11y/label-has-associated-control': 0,

            'react-refresh/only-export-components': ['warn', {
                allowConstantExport: true,
            }],
        },
    },
    {
        files: ['**/*.ts', '**/*.tsx'],

        // Hand over to tsc
        rules: {
            'constructor-super': 'off',
            'getter-return': 'off',
            'no-const-assign': 'off',
            'no-dupe-args': 'off',
            'no-dupe-class-members': 'off',
            'no-dupe-keys': 'off',
            'no-func-assign': 'off',
            'no-import-assign': 'off',
            'no-new-symbol': 'off',
            'no-obj-calls': 'off',
            'no-redeclare': 'off',
            'no-setter-return': 'off',
            'no-this-before-super': 'off',
            'no-undef': 'off',
            'no-unreachable': 'off',
            'no-unsafe-negation': 'off',
            'valid-typeof': 'off',
            'import/named': 'off',
            'import/no-named-as-default-member': 'off',
            'import/no-unresolved': 'off',
        },
    },
]);
