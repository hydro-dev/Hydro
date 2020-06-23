module.exports = {
    root: true,
    env: {
        commonjs: true,
        node: true,
    },
    extends: [
        'airbnb-base',
    ],
    globals: {
        Atomics: 'readonly',
        SharedArrayBuffer: 'readonly',
    },
    parserOptions: {
        ecmaVersion: 2018,
    },
    rules: {
        indent: ['warn', 4],
        'no-plusplus': 'off',
        'no-console': 'off',
        'no-extend-native': 'off',
        'no-underscore-dangle': 'off',
        'no-restricted-syntax': 'off',
        'max-classes-per-file': 'off',
        'guard-for-in': 'off',
        'no-param-reassign': 'off',
        'global-require': 'off',
        'no-nested-ternary': 'off',
        'no-multi-assign': 'off',
        'no-return-await': 'off',
    },
};
