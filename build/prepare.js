const fs = require('fs');
const path = require('path');

const dir = path.dirname(path.dirname(require.resolve('@types/node/package.json')));
const types = fs.readdirSync(dir).filter((i) => !['sharedworker', 'serviceworker'].includes(i));

const compilerOptionsBase = {
    target: 'es2020',
    module: 'commonjs',
    esModuleInterop: true,
    moduleResolution: 'node',
    sourceMap: false,
    composite: true,
    strictBindCallApply: true,
    experimentalDecorators: true,
    // emitDecoratorMetadata: true,
    incremental: true,
    types,
};
const baseOutDir = path.resolve(__dirname, '../.cache/ts-out');
const config = {
    compilerOptions: compilerOptionsBase,
    references: [
        { path: 'tsconfig.ui.json' },
    ],
    files: [],
};
const configSrc = (name) => ({
    compilerOptions: {
        ...compilerOptionsBase,
        outDir: path.join(baseOutDir, name),
        rootDir: 'src',
    },
    include: ['src'],
    exclude: [
        '**/__mocks__',
        'bin',
        'dist',
    ],
});
const configFlat = (name) => ({
    compilerOptions: {
        ...compilerOptionsBase,
        outDir: path.join(baseOutDir, name),
        rootDir: '.',
    },
    include: ['**/*.ts'],
    exclude: ['public'],
});

if (!fs.existsSync(path.resolve(process.cwd(), 'plugins'))) {
    fs.mkdirSync(path.resolve(process.cwd(), 'plugins'));
}

const modules = [
    'packages/hydrooj',
    ...fs.readdirSync(path.resolve(process.cwd(), 'packages')).map((i) => `packages/${i}`),
    ...fs.readdirSync(path.resolve(process.cwd(), 'plugins')).map((i) => `plugins/${i}`),
].filter((i) => !i.includes('/.') && !i.includes('ui-default')).filter((i) => fs.statSync(path.resolve(process.cwd(), i)).isDirectory());

const UIConfig = {
    exclude: [
        'packages/ui-default/public',
    ],
    include: [
        'packages/ui-default/**/*.ts',
        'packages/**/public/**/*.ts',
        'plugins/**/public/**/*.ts',
    ],
    compilerOptions: {
        experimentalDecorators: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        jsx: 'react',
        module: 'commonjs',
        skipLibCheck: true,
        allowSyntheticDefaultImports: true,
        target: 'es2020',
        baseUrl: '.',
        outDir: path.join(baseOutDir, 'ui'),
        moduleResolution: 'node',
        types,
        paths: {
            'vj/*': [
                './packages/ui-default/*',
            ],
        },
    },
};

for (const package of modules) {
    const basedir = path.resolve(process.cwd(), package);
    const files = fs.readdirSync(basedir);
    if (!files.includes('src') && !files.filter((i) => i.endsWith('.ts')).length && package !== 'packages/utils') continue;
    config.references.push({ path: package });
    const expectedConfig = JSON.stringify((files.includes('src') ? configSrc : configFlat)(package));
    const configPath = path.resolve(basedir, 'tsconfig.json');
    const currentConfig = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : '';
    if (expectedConfig !== currentConfig) fs.writeFileSync(configPath, expectedConfig);
    if (!files.includes('src')) continue;
    // Create mapping entry
    for (const file of fs.readdirSync(path.resolve(basedir, 'src'))) {
        if (!fs.statSync(path.resolve(basedir, 'src', file)).isFile()) continue;
        const name = file.split('.')[0];
        const filePath = path.resolve(basedir, `${name}.js`);
        if (['handler', 'service', 'lib', 'model', 'script', 'index'].includes(name)) {
            if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, `module.exports = require('./src/${name}');\n`);
        }
    }
}
fs.writeFileSync(path.resolve(process.cwd(), 'tsconfig.ui.json'), JSON.stringify(UIConfig));
fs.writeFileSync(path.resolve(process.cwd(), 'tsconfig.json'), JSON.stringify(config));
