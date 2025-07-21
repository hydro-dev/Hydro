/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/naming-convention */
import path from 'node:path';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import react from '@hydrooj/eslint-config';

export default defineConfig([globalIgnores([
    '**/{public,files}/**/*.js',
    '**/dist',
    '**/*.d.ts',
    '**/node_modules',
    '**/.*.js',
    'packages/ui-default/public',
]), {
    extends: [react],

    languageOptions: {
        ecmaVersion: 5,
        sourceType: 'module',
    },

    settings: {
        'import/parsers': {
            '@typescript-eslint/parser': ['.ts', '.js', '.jsx', '.tsx'],
        },

        'import/resolver': {
            webpack: {
                config: {
                    resolve: {
                        extensions: ['.js', '.jsx', '.ts', '.tsx', '.vue'],
                    },
                },
            },
        },
    },

    rules: {
        '@typescript-eslint/no-invalid-this': 1,

        'simple-import-sort/imports': ['warn', {
            groups: [
                ['^\\u0000'],
                [
                    '^(node:)?(assert|buffer|child_process|cluster|console|constants|crypto|dgram|dns|domain|events|fs|http|https|module|net|os|path|punycode|querystring|readline|repl|stream|string_decoder|sys|timers|tls|tty|url|util|vm|zlib|freelist|v8|process|async_hooks|http2|perf_hooks)(/.*|$)',
                    '^(?!@?hydrooj)(@?\\w.+)',
                    '^@?hydrooj',
                    '^',
                    '^\\.',
                ]],
        }],
    },
}, {
    files: [
        '**/{public,frontend}/**/*.{ts,tsx,page.js}',
        '**/plugins/**/*.page.{ts,js,tsx,jsx}',
        'packages/ui-default/**/*.{ts,tsx,js,jsx}',
    ],

    languageOptions: {
        globals: {
            ...globals.browser,
            ...globals.jquery,
            ...globals.commonjs,
            UiContext: true,
            UserContext: true,
            externalModules: true,
            LOCALES: true,
            LANGS: true,
            __webpack_public_path__: true,
            __webpack_require__: true,
        },
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
    },

    settings: {
        'react-x': {
            version: '18.3.1',
        },
        'import/resolver': {
            webpack: {
                config: {
                    resolve: {
                        extensions: ['.js', '.jsx', '.ts', '.tsx'],
                        alias: {
                            vj: path.resolve('./packages/ui-default'),
                        },
                    },
                },
            },
        },
    },

    rules: {
        'github/array-foreach': 0,
        '@typescript-eslint/no-invalid-this': 0,

        // FIXME A bug with eslint-parser
        // 'template-curly-spacing': 'off',

        '@stylistic/indent': [
            'warn',
            2,
            { SwitchCase: 1 },
        ],
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
                    [
                        '^(node:)?(assert|buffer|child_process|cluster|console|constants|crypto|dgram|dns|domain|events|fs|http|https|module|net|os|path|punycode|querystring|readline|repl|stream|string_decoder|sys|timers|tls|tty|url|util|vm|zlib|freelist|v8|process|async_hooks|http2|perf_hooks)(/.*|$)',
                        '^@?hydrooj',
                        '^',
                        '^(@|vj)\\/',
                        '^\\.',
                    ],
                ],
            },
        ],
    },
}, {
    files: ['packages/ui-next/src/**/*.{ts,tsx}'],

    languageOptions: {
        globals: {
            ...globals.browser,
        },
    },

    rules: {
        '@stylistic/indent': ['warn', 2],
    },
}]);
