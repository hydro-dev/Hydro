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
        ...option,
        ignores: [
            '**/*.d.ts',
            '**/.git',
            ...(option.ignores || []),
        ],
        vue: true,
        typescript: true,
        markdown: false,
        gitignore: false,
        stylistic: {
            indent: 4,
            quotes: undefined,
            semi: true,
            ...(typeof option.stylistic === 'object' ? option.stylistic : {}),
        },

        settings: {
            'import/resolver': {
                node: {
                    extensions: ['.mjs', '.js', '.json', '.ts', '.d.ts'],
                },
            },

            'import/extensions': ['.js', '.mjs', '.jsx', '.ts', '.tsx', '.d.ts'],
            'import/external-module-folders': ['node_modules', 'node_modules/@types'],
        },

        plugins: {
            'simple-import-sort': simpleImportSort,
            'react-refresh': reactRefresh,
            '@eslint-react': eslintReact,
        },

        languageOptions: {
            globals: {
                Atomics: 'readonly',
                SharedArrayBuffer: 'readonly',
                BigInt: 'readonly',
            },
        },
        rules: {
            'antfu/if-newline': 'off',
            'antfu/curly': 'off',
            'antfu/consistent-list-newline': 'off',
            'antfu/consistent-chaining': 'off',
            'antfu/top-level-function': 'off',

            'ts/prefer-as-const': 'off',
            'ts/no-redeclare': 'off',
            'ts/no-namespace': 'off',
            'ts/no-magic-numbers': 'off',
            'ts/no-this-alias': 'off',
            'ts/no-require-imports': 'off',
            'ts/consistent-type-imports': 'off',
            'ts/ban-ts-comment': 'off',
            'ts/no-invalid-this': 'off',
            'ts/require-await': 'off',
            'ts/method-signature-style': 'off',

            'default-param-last': 'off',

            'perfectionist/sort-imports': 'off',
            'perfectionist/sort-named-imports': 'off',
            'node/prefer-global/buffer': 'off',
            'node/prefer-global/process': 'off',
            'eslint-comments/no-unlimited-disable': 'off',
            'style/jsx-one-expression-per-line': 'off',
            'style/multiline-ternary': 'off',
            'style/jsx-wrap-multilines': 'off',
            'style/jsx-closing-tag-location': 'off',
            'style/jsx-closing-bracket-location': 'off',
            'style/jsx-function-call-newline': 'off',
            'import/consistent-type-specifier-style': 'off',
            'test/no-import-node-test': 'off',
            'unicorn/error-message': 'off',
            'unicorn/prefer-node-protocol': 'off',
            'unicorn/no-instanceof-builtins': 'off',
            'regexp/use-ignore-case': 'off',
            'regexp/prefer-d': 'off',
            'regexp/prefer-w': 'off',
            'unused-imports/no-unused-vars': 'off',

            'style/brace-style': ['error', '1tbs', {
                allowSingleLine: true,
            }],
            'style/quotes': ['warn', 'single', {
                avoidEscape: true,
            }],
            curly: ['error', 'multi-line'],
            'style/max-statements-per-line': ['error', { max: 2 }],
            'style/indent': ['warn', option.stylistic?.indent ?? 4, {
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
            'style/indent-binary-ops': 'off',
            'style/jsx-indent': 'off',
            'style/jsx-indent-props': 'off',
            'style/comma-spacing': ['error', {
                before: false,
                after: true,
            }],
            'style/operator-linebreak': ['warn', 'before', {
                overrides: {
                    '=': 'after',
                },
            }],
            'style/no-extra-semi': 'error',
            'style/comma-dangle': ['error', {
                arrays: 'always-multiline',
                objects: 'always-multiline',
                imports: 'always-multiline',
                exports: 'always-multiline',
                functions: 'always-multiline',
                enums: 'always-multiline',
                generics: 'always-multiline',
                tuples: 'always-multiline',
            }],
            'style/function-call-spacing': ['error', 'never'],
            'style/keyword-spacing': ['error', {
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
            'style/lines-between-class-members': ['error', 'always', {
                exceptAfterSingleLine: true,
            }],
            'style/space-before-blocks': 'error',
            'style/arrow-parens': ['error', 'always'],
            'style/member-delimiter-style': ['error', {
                multiline: {
                    delimiter: 'semi',
                    requireLast: true,
                },
                singleline: {
                    delimiter: 'comma',
                    requireLast: false,
                },
                multilineDetection: 'brackets',
            }],
            'style/space-before-function-paren': ['error', {
                anonymous: 'always',
                named: 'never',
                asyncArrow: 'always',
            }],
            'style/space-infix-ops': 'error',
            'style/object-curly-spacing': ['error', 'always'],

            'style/quote-props': ['warn', 'as-needed'],
            'style/generator-star-spacing': ['error', {
                before: false,
                after: true,
                anonymous: { before: false, after: true },
                method: { before: true, after: false },
            }],

            'ts/no-array-constructor': 'error',
            'ts/no-dupe-class-members': 'error',
            'ts/no-empty-function': ['error', {
                allow: ['arrowFunctions', 'functions', 'methods'],
            }],
            'ts/no-extra-parens': ['off', 'all', {
                conditionalAssign: true,
                nestedBinaryExpressions: false,
                returnAssign: false,
                ignoreJSX: 'all',
                enforceForArrowConditionals: false,
            }],
            'ts/no-loss-of-precision': 'error',
            'ts/no-loop-func': 'error',
            'ts/no-shadow': 'error',
            'ts/no-unused-expressions': ['error', {
                allowShortCircuit: false,
                allowTernary: false,
                allowTaggedTemplates: false,
            }],
            'ts/no-unused-vars': ['error', {
                vars: 'all',
                args: 'after-used',
                ignoreRestSiblings: true,
                caughtErrorsIgnorePattern: '^_|e',
                argsIgnorePattern: '^_',
            }],
            'ts/no-use-before-define': ['error', {
                functions: true,
                classes: true,
                variables: true,
            }],
            'ts/no-useless-constructor': 'error',

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

            'class-methods-use-this': 0,
            'global-require': 0,
            'guard-for-in': 0,
            'implicit-arrow-linebreak': 0,
            'consistent-return': 1,
            'func-names': 0,

            'import/extensions': 0,
            'import/order': 0,
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

            'github/array-foreach': 1,
            'github/a11y-svg-has-accessible-name': 0,
            'quote-props': 0,

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

            ...(option.rules || {}),
        },
    },
    github.getFlatConfigs().react,
    deMorgan.configs.recommended,
    {

        rules: {
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
    {
        files: ['**/*.yaml', '**/*.yml'],
        rules: {
            'style/no-multi-spaces': 'off',
        },
    },
    ...args,
);

export default base;
