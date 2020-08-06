module.exports = {
    root: true,
    env: {
        node: true,
    },
    extends: [
        'airbnb-base',
    ],
    globals: {
        Atomics: 'readonly',
        SharedArrayBuffer: 'readonly',
        BigInt: true,
    },
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    rules: {
        camelcase: 'off',
        '@typescript-eslint/no-unused-vars': 'error',
        'global-require': 'off',
        'guard-for-in': 'off',
        'implicit-arrow-linebreak': 'off',
        'import/extensions': 'off',
        'import/no-named-as-default-member': 'off',
        'import/prefer-default-export': 'off',
        indent: ['warn', 4],
        'max-classes-per-file': 'off',
        'no-bitwise': 'off',
        'no-console': 'off',
        'no-extend-native': 'off',
        'no-inner-declarations': 'off',
        'no-multi-assign': 'off',
        'no-nested-ternary': 'off',
        'no-param-reassign': 'off',
        'no-plusplus': 'off',
        'no-restricted-syntax': 'off',
        'no-return-await': 'off',
        'no-underscore-dangle': 'off',
        'no-unused-vars': 'off',
        'prefer-destructuring': 'off',
    },
    settings: {
        'import/parsers': {
            '@typescript-eslint/parser': ['.ts'],
        },
        'import/resolver': {
            typescript: {
                alwaysTryTypes: true,
            },
        },
    },
};
