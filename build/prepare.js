const fs = require('fs');
const path = require('path');

const dir = path.dirname(path.dirname(require.resolve('@types/node/package.json')));
const types = fs.readdirSync(dir).filter((i) => !['sharedworker', 'serviceworker'].includes(i));

const compilerOptionsBase = {
    target: 'es2020',
    module: 'commonjs',
    esModuleInterop: true,
    moduleResolution: 'node',
    // declaration: true,
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
    references: [],
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
const configFlat = (name) => (name === 'packages/ui-default' ? {
    exclude: [
        './public',
    ],
    compilerOptions: {
        resolveJsonModule: true,
        jsx: 'react',
        module: 'es2020',
        allowSyntheticDefaultImports: true,
        target: 'es2020',
        baseUrl: '.',
        moduleResolution: 'node',
        types,
        paths: {
            'vj/*': [
                './*',
            ],
        },
    },
} : {
    compilerOptions: {
        ...compilerOptionsBase,
        outDir: path.join(baseOutDir, name),
        rootDir: '.',
    },
    include: ['**/*.ts'],
    exclude: [],
});

if (!fs.existsSync(path.resolve(process.cwd(), 'plugins'))) {
    fs.mkdirSync(path.resolve(process.cwd(), 'plugins'));
}

const modules = [
    'packages/hydrooj',
    ...fs.readdirSync(path.resolve(process.cwd(), 'packages')).map((i) => `packages/${i}`),
    ...fs.readdirSync(path.resolve(process.cwd(), 'plugins')).map((i) => `plugins/${i}`),
].filter((i) => !i.includes('/.')).filter((i) => fs.statSync(path.resolve(process.cwd(), i)).isDirectory());

for (const package of modules) {
    config.references.push({ path: package });
    const basedir = path.resolve(process.cwd(), package);
    const files = fs.readdirSync(basedir);
    if (!files.includes('src') && !files.filter((i) => i.endsWith('.ts')).length && package !== 'packages/utils') continue;
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
fs.writeFileSync(path.resolve(process.cwd(), 'tsconfig.json'), JSON.stringify(config));
