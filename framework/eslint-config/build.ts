import fs from 'fs';
import yaml from 'js-yaml';

const base = yaml.load(fs.readFileSync('base.yaml', 'utf8')) as any;
const react = yaml.load(fs.readFileSync('react.yaml', 'utf8')) as any;

function sort<T>(obj: Record<string, T>): Record<string, T> {
    return Object.keys(obj).sort().reduce(
        (acc, key) => {
            acc[key] = obj[key];
            return acc;
        },
    ) as any;
}

// NOTE: oxlint doesn't support most stylistic rules

const rules = sort({
    ...base.rules,
    ...react.rules,
    'no-unused-vars': [
        'off',
        // 'error',
        // {
        //     caughtErrorsIgnorePattern: '^_|e',
        //     argsIgnorePattern: '^_',
        // },
    ],

    'no-await-in-loop': 'off', // temporary disable the file until oxlint support extending config

    // Let typescript to the thing
    'no-undef': 'off',
    'no-empty-function': 'off',
    'no-lonely-if': 'off',
    'no-unsafe-declaration-merging': 'off',
    'no-this-alias': 'off',
    'no-new-array': 'off', // It breaks [...new Array(n)].map()
    'no-useless-spread': 'off', // It breaks [...new Array(n)].map()
    'no-script-url': 'off', // It breaks createElement('a').setAttribute('href', 'javascript:;')
});

delete rules['@typescript-eslint/no-unused-vars'];

fs.writeFileSync('.oxlintrc.json', JSON.stringify({
    $schema: './node_modules/oxlint/configuration_schema.json',
    rules,
    env: {
        browser: true,
        es6: true,
        jquery: true,
        node: true,
    },
    globals: {
        UiContext: 'readonly',
        UserContext: 'readonly',
        externalModules: 'readonly',
        LOCALES: 'readonly',
    },
}, null, 2));
