const fs = require('fs-extra');
const path = require('path');
const child = require('child_process');

if (process.env.npm_execpath?.includes('yarn')) {
    if (fs.existsSync('plugins/patch-package/package.json') && fs.existsSync('node_modules/patch-package/package.json')) {
        child.execSync('npx patch-package --patch-dir=plugins/patch-package/patches', { stdio: 'inherit' });
    }
}

const withoutTypes = (data) => ({
    ...data,
    compilerOptions: Object.fromEntries(Object.entries(data.compilerOptions).filter(([k]) => k !== 'types')),
});

/** @type {import('typescript/lib/typescript').CompilerOptions} */
const compilerOptionsBase = {
    target: 'es2020',
    module: 'commonjs',
    esModuleInterop: true,
    moduleResolution: 'node',
    jsx: 'react',
    sourceMap: false,
    composite: true,
    strictBindCallApply: true,
    resolveJsonModule: true,
    experimentalDecorators: true,
    // emitDecoratorMetadata: true,
    incremental: true,
};
const baseOutDir = path.resolve(__dirname, '../.cache/ts-out');
const config = {
    compilerOptions: compilerOptionsBase,
    references: [
        { path: 'tsconfig.ui.json' },
        { path: 'plugins/tsconfig.json' },
    ],
    files: [],
};
const exclude = ['**/public', '**/frontend', '**/node_modules', '**/bin', '**/dist', '**/__mocks__'];
const configSrc = (name) => ({
    compilerOptions: {
        ...compilerOptionsBase,
        outDir: path.join(baseOutDir, name),
        rootDir: 'src',
    },
    include: ['src'],
    exclude,
});
const configFlat = (name) => ({
    compilerOptions: {
        ...compilerOptionsBase,
        outDir: path.join(baseOutDir, name),
        rootDir: '.',
        paths: {
            'vj/*': [
                '../../packages/ui-default/*',
            ],
        },
    },
    include: ['**/*.ts'],
    exclude,
});

for (const name of ['plugins', 'modules']) {
    if (!fs.existsSync(path.resolve(process.cwd(), name))) {
        fs.mkdirSync(path.resolve(process.cwd(), name));
    }
    // Write an empty file to make eslint happy
    fs.writeFileSync(path.resolve(process.cwd(), name, 'nop.ts'), 'export default {};\n');
}

const modules = [
    'packages/hydrooj',
    ...['packages', 'framework'].flatMap((i) => fs.readdirSync(path.resolve(process.cwd(), i)).map((j) => `${i}/${j}`)),
].filter((i) => !i.includes('/.') && !i.includes('ui-default')).filter((i) => fs.statSync(path.resolve(process.cwd(), i)).isDirectory());

const UIConfig = {
    exclude: [
        'packages/ui-default/public',
        '**/node_modules',
    ],
    include: ['ts', 'tsx', 'vue', 'json']
        .flatMap((ext) => ['plugins']
            .flatMap((name) => [`${name}/**/public/**/*.${ext}`, `${name}/**/frontend/**/*.${ext}`])
            .concat(`packages/ui-default/**/*.${ext}`)),
    compilerOptions: {
        ...compilerOptionsBase,
        module: 'ESNext',
        skipLibCheck: true,
        allowSyntheticDefaultImports: true,
        baseUrl: '.',
        outDir: path.join(baseOutDir, 'ui'),
        paths: {
            'vj/*': [
                './packages/ui-default/*',
            ],
        },
    },
};

const nm = path.resolve(__dirname, '../node_modules');
fs.ensureDirSync(path.join(nm, '@hydrooj'));
try {
    fs.symlinkSync(
        path.join(process.cwd(), 'packages/ui-default'),
        path.join(nm, '@hydrooj/ui-default'),
        'dir',
    );
} catch (e) { }

const pluginsConfig = {
    include: [
        '**/*.ts',
    ],
    exclude,
    compilerOptions: {
        ...compilerOptionsBase,
        rootDir: '.',
        baseUrl: '.',
        outDir: path.join(baseOutDir, 'plugins'),
        paths: {
            'vj/*': [
                '../packages/ui-default/*',
            ],
        },
    },
};
fs.writeFileSync(path.resolve(process.cwd(), 'plugins', 'tsconfig.json'), JSON.stringify(pluginsConfig));

for (const package of modules) {
    const basedir = path.resolve(process.cwd(), package);
    const files = fs.readdirSync(basedir);
    try {
        // eslint-disable-next-line import/no-dynamic-require
        const name = require(path.join(basedir, 'package.json')).name;
        fs.symlinkSync(basedir, path.join(nm, name), 'dir');
    } catch (e) { }
    if (!files.includes('src') && !files.filter((i) => i.endsWith('.ts')).length && package !== 'packages/utils') continue;
    config.references.push({ path: package });
    const origConfig = (files.includes('src') ? configSrc : configFlat)(package);
    const expectedConfig = JSON.stringify(package.startsWith('modules/') ? withoutTypes(origConfig) : origConfig);
    const configPath = path.resolve(basedir, 'tsconfig.json');
    const currentConfig = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : '';
    if (expectedConfig !== currentConfig) fs.writeFileSync(configPath, expectedConfig);
    if (!files.includes('src')) continue;
    // Create mapping entry
    for (const file of fs.readdirSync(path.resolve(basedir, 'src'))) {
        if (!fs.statSync(path.resolve(basedir, 'src', file)).isFile()) continue;
        const name = file.split('.')[0];
        const filePath = path.resolve(basedir, `${name}.js`);
        if (name === 'index' && !fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, 'module.exports = require("./src/index");\n');
        }
    }
}
fs.writeFileSync(path.resolve(process.cwd(), 'tsconfig.ui.json'), JSON.stringify(UIConfig));
fs.writeFileSync(path.resolve(process.cwd(), 'tsconfig.json'), JSON.stringify(config));
