/* eslint perfectionist/sort-objects: error */
import antfu from '@antfu/eslint-config';
import eslintReact from '@eslint-react/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import deMorgan from 'eslint-plugin-de-morgan';
import github from 'eslint-plugin-github';
import reactRefresh from 'eslint-plugin-react-refresh';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

/** @type {typeof antfu} */
const base = (option, ...args) => antfu(
    {
        markdown: false,
        typescript: true,
        vue: true,
        ...option,
        gitignore: false,
        ignores: [
            '**/*.d.ts',
            '**/.git',
            '**/.pnp.*',
            ...(option.ignores || []),
        ],
        languageOptions: {
            globals: {
                Atomics: 'readonly',
                BigInt: 'readonly',
                SharedArrayBuffer: 'readonly',
                ...(option.languageOptions?.globals || {}),
            },
            ...(option.languageOptions || {}),
        },
        lessOpinionated: true,
        plugins: {
            '@eslint-react': eslintReact,
            'react-refresh': reactRefresh,
            'simple-import-sort': simpleImportSort,
            ...(option.plugins || {}),
        },
        rules: {
            '@eslint-react/dom/no-missing-button-type': 0,
            // to allow `javascript:;`
            '@eslint-react/dom/no-script-url': 0,
            '@eslint-react/hooks-extra/no-direct-set-state-in-use-effect': 0,
            '@eslint-react/hooks-extra/no-unnecessary-use-prefix': 0,
            '@eslint-react/no-array-index-key': 0,

            // ui-default is currently on react 18
            '@eslint-react/no-prop-types': 0,
            '@eslint-react/no-string-refs': 0,

            'antfu/consistent-chaining': 'off',
            'antfu/consistent-list-newline': 'off',

            'class-methods-use-this': 0,
            'consistent-return': 1,
            curly: ['error', 'multi-line'],
            'default-param-last': 'off',
            'dot-notation': 0,
            'eslint-comments/no-unlimited-disable': 'off',
            'func-names': 0,
            'function-call-argument-newline': 0,
            'function-paren-newline': 0,
            'github/a11y-svg-has-accessible-name': 0,
            'github/array-foreach': 1,
            'global-require': 0,
            'guard-for-in': 0,
            'implicit-arrow-linebreak': 0,

            'import/consistent-type-specifier-style': 'off',
            'import/extensions': 0,
            'import/newline-after-import': 0,
            'import/no-cycle': 0,
            'import/no-extraneous-dependencies': 0,
            'import/no-named-as-default': 0,
            'import/order': 0,
            'import/prefer-default-export': 0,

            'jsx-a11y/anchor-is-valid': 0,
            'jsx-a11y/click-events-have-key-events': 0,
            'jsx-a11y/label-has-associated-control': 0,
            'jsx-a11y/no-static-element-interactions': 0,

            'logical-assignment-operators': ['warn', 'always', {
                enforceForIfStatements: true,
            }],
            'max-classes-per-file': 0,
            'max-len': ['warn', 150],
            'newline-per-chained-call': 0,
            'no-await-in-loop': 1,
            'no-bitwise': 0,
            'no-console': 0,
            'no-continue': 0,
            'no-empty': ['warn', {
                allowEmptyCatch: true,
            }],
            'no-empty-pattern': 0,
            'no-extend-native': 0,
            'no-extra-boolean-cast': ['warn', {
                enforceForLogicalOperands: true,
            }],
            'no-implicit-coercion': ['warn', {
                allow: ['!!', '+'],
            }],
            'no-multi-assign': 0,
            'no-multi-str': 0,
            'no-nested-ternary': 0,
            'no-param-reassign': 0,
            'no-plusplus': 0,
            'no-restricted-syntax': [
                'error', {
                    message: 'Labels are a form of GOTO; using them makes code confusing and hard to maintain and understand.',
                    selector: 'LabeledStatement',
                }, {
                    message: '`with` is disallowed in strict mode because it makes code impossible to predict and optimize.',
                    selector: 'WithStatement',
                },
            ],
            'no-return-await': 0,
            'no-underscore-dangle': 0,
            'no-unmodified-loop-condition': 1,
            'no-useless-concat': 'warn',

            'node/prefer-global/buffer': 'off',
            'node/prefer-global/process': 'off',
            'perfectionist/sort-imports': 'off',
            'perfectionist/sort-named-imports': 'off',

            'prefer-destructuring': 0,
            'prefer-template': 'warn',
            'quote-props': 0,
            'react-hooks/exhaustive-deps': 0,
            'react-refresh/only-export-components': ['warn', {
                allowConstantExport: true,
            }],

            'regexp/prefer-d': 'off',
            'regexp/prefer-w': 'off',
            'regexp/use-ignore-case': 'off',

            'simple-import-sort/exports': 0,
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

            'style/arrow-parens': ['error', 'always'],
            'style/brace-style': ['error', '1tbs', {
                allowSingleLine: true,
            }],
            'style/comma-dangle': ['error', {
                arrays: 'always-multiline',
                enums: 'always-multiline',
                exports: 'always-multiline',
                functions: 'always-multiline',
                generics: 'always-multiline',
                imports: 'always-multiline',
                objects: 'always-multiline',
                tuples: 'always-multiline',
            }],
            'style/comma-spacing': ['error', {
                after: true,
                before: false,
            }],
            'style/function-call-spacing': ['error', 'never'],
            'style/generator-star-spacing': ['error', {
                after: true,
                anonymous: { after: true, before: false },
                before: false,
                method: { after: false, before: true },
            }],
            'style/indent': ['warn', option.stylistic?.indent ?? 4, {
                ArrayExpression: 1,
                CallExpression: {
                    arguments: 1,
                },
                flatTernaryExpressions: false,
                FunctionDeclaration: {
                    body: 1,
                    parameters: 1,
                },
                FunctionExpression: {
                    body: 1,
                    parameters: 1,
                },
                ignoreComments: false,
                ignoredNodes: [
                    // 'JSXElement',
                    // 'JSXElement > *',
                    // 'JSXAttribute',
                    // 'JSXIdentifier',
                    // 'JSXNamespacedName',
                    // 'JSXMemberExpression',
                    // 'JSXSpreadAttribute',
                    // 'JSXExpressionContainer',
                    // 'JSXOpeningElement',
                    // 'JSXClosingElement',
                    // 'JSXFragment',
                    // 'JSXOpeningFragment',
                    // 'JSXClosingFragment',
                    'JSXText',
                    // 'JSXEmptyExpression',
                    // 'JSXSpreadChild',
                ],
                ImportDeclaration: 1,
                ObjectExpression: 1,
                outerIIFEBody: 1,
                SwitchCase: 1,
                VariableDeclarator: 1,
            }],
            'style/jsx-closing-bracket-location': 'off',
            'style/jsx-closing-tag-location': 'off',
            'style/jsx-function-call-newline': 'off',
            'style/jsx-indent-props': 'off',
            'style/jsx-one-expression-per-line': 'off',
            'style/jsx-wrap-multilines': 'off',
            'style/keyword-spacing': ['error', {
                after: true,
                before: true,
                overrides: {
                    case: {
                        after: true,
                    },
                    return: {
                        after: true,
                    },
                    throw: {
                        after: true,
                    },
                },
            }],
            'style/lines-between-class-members': ['error', 'always', {
                exceptAfterSingleLine: true,
            }],
            'style/max-statements-per-line': ['error', { max: 2 }],
            'style/member-delimiter-style': ['error', {
                multiline: {
                    delimiter: 'semi',
                    requireLast: true,
                },
                multilineDetection: 'brackets',
                singleline: {
                    delimiter: 'comma',
                    requireLast: false,
                },
            }],
            'style/multiline-ternary': 'off',
            'style/no-extra-semi': 'error',
            'style/object-curly-spacing': ['error', 'always'],
            'style/operator-linebreak': ['warn', 'before', {
                overrides: {
                    '=': 'after',
                },
            }],
            'style/quote-props': ['warn', 'as-needed'],
            'style/quotes': ['warn', 'single', {
                avoidEscape: true,
            }],
            'style/space-before-blocks': 'error',
            'style/space-before-function-paren': ['error', {
                anonymous: 'always',
                asyncArrow: 'always',
                named: 'never',
            }],
            'style/space-infix-ops': 'error',

            'test/no-import-node-test': 'off',

            'ts/ban-ts-comment': 'off',
            'ts/consistent-type-imports': 'off',
            'ts/method-signature-style': 'off',
            'ts/no-array-constructor': 'error',
            'ts/no-dupe-class-members': 'error',
            'ts/no-empty-function': ['error', {
                allow: ['arrowFunctions', 'functions', 'methods'],
            }],
            'ts/no-extra-parens': ['off', 'all', {
                conditionalAssign: true,
                enforceForArrowConditionals: false,
                ignoreJSX: 'all',
                nestedBinaryExpressions: false,
                returnAssign: false,
            }],
            'ts/no-invalid-this': 'off',
            'ts/no-loop-func': 'error',
            'ts/no-loss-of-precision': 'error',
            'ts/no-magic-numbers': 'off',
            'ts/no-namespace': 'off',
            'ts/no-redeclare': 'off',
            'ts/no-require-imports': 'off',
            'ts/no-shadow': 'error',
            'ts/no-this-alias': 'off',
            'ts/no-unused-expressions': ['error', {
                allowShortCircuit: false,
                allowTaggedTemplates: false,
                allowTernary: false,
            }],
            'ts/no-unused-vars': ['error', {
                args: 'after-used',
                argsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_|e',
                ignoreRestSiblings: true,
                vars: 'all',
            }],
            'ts/no-use-before-define': ['error', {
                classes: true,
                functions: true,
                variables: true,
            }],
            'ts/no-useless-constructor': 'error',
            'ts/prefer-as-const': 'off',
            'ts/require-await': 'off',

            'unicorn/error-message': 'off',
            'unicorn/no-instanceof-builtins': 'off',
            'unicorn/prefer-node-protocol': 'off',

            'unused-imports/no-unused-vars': 'off',

            ...(option.rules || {}),
        },
        settings: {
            'import/extensions': ['.js', '.mjs', '.jsx', '.ts', '.tsx', '.d.ts'],
            'import/external-module-folders': ['node_modules', 'node_modules/@types'],
            'import/resolver': {
                node: {
                    extensions: ['.mjs', '.js', '.json', '.ts', '.d.ts'],
                },
            },
            ...(option.settings || {}),
        },
        stylistic: {
            indent: 4,
            quotes: undefined,
            semi: true,
            ...(typeof option.stylistic === 'object' ? option.stylistic : {}),
        },
    },
    github.getFlatConfigs().react,
    deMorgan.configs.recommended,
    {
        files: ['**/*.vue'],
        rules: {
            'vue/block-order': ['warn', { order: ['template', 'script[setup]', 'script:not([setup])', 'style[scoped]', 'style:not([scoped])'] }],
            'vue/singleline-html-element-content-newline': 'off',
        },
    },
    {
        files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.cjs', '**/*.cts', '**/*.mjs', '**/*.mts'],

        languageOptions: {
            parser: tsParser,
        },

        rules: {
            'ts/naming-convention': [
                'warn',
                {
                    format: ['camelCase'],
                    leadingUnderscore: 'allowSingleOrDouble',
                    selector: 'default',
                }, {
                    filter: {
                        match: true,
                        regex: '^([A-Z]|_+id|__call__)$',
                    },
                    format: null,
                    selector: 'default',
                }, {
                    format: null,
                    modifiers: ['destructured'],
                    selector: 'variable',
                }, {
                    format: null,
                    selector: 'import',
                }, {
                    format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
                    leadingUnderscore: 'allowSingleOrDouble',
                    modifiers: ['const'],
                    selector: 'variable',
                }, {
                    format: ['camelCase', 'PascalCase', 'UPPER_CASE', 'snake_case'],
                    leadingUnderscore: 'allowSingleOrDouble',
                    selector: 'property',
                }, {
                    filter: {
                        match: false,
                        regex: '__call__',
                    },
                    format: ['camelCase', 'PascalCase'],
                    leadingUnderscore: 'allowSingleOrDouble',
                    selector: ['function', 'parameter', 'parameterProperty', 'objectLiteralMethod'],
                }, {
                    filter: {
                        match: true,
                        regex: '^[\\d]+$',
                    },
                    format: null,
                    selector: ['objectLiteralProperty'],
                }, {
                    format: null,
                    modifiers: ['requiresQuotes'],
                    selector: ['typeProperty', 'typeMethod', 'objectLiteralProperty'],
                }, {
                    format: ['camelCase', 'PascalCase'],
                    selector: ['typeMethod'],
                }, {
                    format: ['PascalCase'],
                    selector: ['enum', 'class', 'interface'],
                }, {
                    format: ['PascalCase', 'camelCase', 'UPPER_CASE'],
                    selector: ['typeAlias', 'enumMember', 'typeParameter'],
                },
            ],
        },
    },
    {
        files: ['**/*.ts', '**/*.tsx', '**/*.cts', '**/*.mts'],

        languageOptions: {
            parser: tsParser,
        },

        // Hand over to tsc
        rules: {
            'constructor-super': 'off',
            'getter-return': 'off',
            'import/named': 'off',
            'import/no-named-as-default-member': 'off',
            'import/no-unresolved': 'off',
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
        },
    },
    {
        files: ['**/*.yaml', '**/*.yml'],
        rules: {
            'style/no-multi-spaces': 'off',
        },
    },
    ...args,
);

export default base;
