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
    target: 'es2022',
    lib: ['es2022'],
    module: 'preserve',
    esModuleInterop: true,
    moduleResolution: 'bundler',
    jsx: 'react-jsx',
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
        { path: 'tsconfig.ui-next.json' },
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
    include: ['**/*.ts', '**/*.tsx'],
    exclude,
});

for (const name of ['plugins', 'modules']) {
    if (!fs.existsSync(path.resolve(process.cwd(), name))) {
        fs.mkdirSync(path.resolve(process.cwd(), name));
    }
    // Write an empty file to make eslint happy
    fs.writeFileSync(path.resolve(process.cwd(), name, 'nop.ts'), 'export default {};\n');
    fs.writeFileSync(
        path.resolve(process.cwd(), name, 'vue-types.d.ts'),
        'declare module "*.vue" {\n  const content: any;\n  export default content;\n}\n',
    );
}

const modules = [
    'packages/hydrooj',
    ...['packages', 'framework'].flatMap((i) => fs.readdirSync(path.resolve(process.cwd(), i)).map((j) => `${i}/${j}`)),
].filter((i) => !['/.', 'ui-default', 'ui-next'].some((t) => i.includes(t))).filter((i) => fs.statSync(path.resolve(process.cwd(), i)).isDirectory());

const UIConfig = {
    exclude: [
        'packages/ui-default/public',
        'packages/ui-default/index.ts',
        'packages/ui-default/backendlib/builder.ts',
        'packages/ui-default/backendlib/misc.ts',
        'packages/ui-default/backendlib/template.ts',
        'packages/ui-default/backendlib/markdown.js',
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
        jsx: 'react-jsx',
        outDir: path.join(baseOutDir, 'ui'),

        useDefineForClassFields: true,
        lib: ['es2022', 'DOM', 'DOM.Iterable'],

        /* Bundler mode */
        moduleResolution: 'bundler',
        moduleDetection: 'force',
        noEmit: true,

        /* Linting */
        noFallthroughCasesInSwitch: true,
        noUncheckedSideEffectImports: true,

        paths: {
            'vj/*': [
                './packages/ui-default/*',
            ],
        },
    },
};

const UINextConfig = {
    exclude: [
        '**/node_modules',
    ],
    include: ['ts', 'tsx', 'vue', 'json'].map((ext) => `packages/ui-next/src/**/*.${ext}`),
    compilerOptions: {
        ...compilerOptionsBase,
        module: 'ESNext',
        skipLibCheck: true,
        allowSyntheticDefaultImports: true,
        baseUrl: '.',
        jsx: 'react-jsx',
        outDir: path.join(baseOutDir, 'ui-next'),

        strict: true,
        noImplicitAny: false,

        useDefineForClassFields: true,
        lib: ['es2022', 'DOM', 'DOM.Iterable'],

        /* Bundler mode */
        moduleResolution: 'bundler',
        moduleDetection: 'force',
        noEmit: true,

        /* Linting */
        noFallthroughCasesInSwitch: true,
        noUncheckedSideEffectImports: true,

        paths: {
            '@/*': [
                './packages/ui-next/src/*',
            ],
            'vj/*': [
                './packages/ui-default/*',
            ],
        },
    },
};

const tryUpdate = (location, content) => {
    const current = fs.existsSync(location) ? fs.readFileSync(location, 'utf-8') : '';
    const expected = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    if (expected !== current) fs.writeFileSync(location, expected);
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
        skipLibCheck: true,
        paths: {
            'vj/*': [
                '../packages/ui-default/*',
            ],
        },
    },
};
tryUpdate(path.resolve(process.cwd(), 'plugins', 'tsconfig.json'), pluginsConfig);

for (const pkg of modules) {
    const basedir = path.resolve(process.cwd(), pkg);
    const files = fs.readdirSync(basedir);
    try {
        // eslint-disable-next-line import/no-dynamic-require
        const name = require(path.join(basedir, 'package.json')).name;
        fs.symlinkSync(basedir, path.join(nm, name), 'dir');
    } catch (e) { }
    if (!files.includes('src') && !files.filter((i) => i.endsWith('.ts')).length && pkg !== 'packages/utils') continue;
    config.references.push({ path: pkg });
    const origConfig = (files.includes('src') ? configSrc : configFlat)(pkg);
    const expectedConfig = JSON.stringify(pkg.startsWith('modules/') ? withoutTypes(origConfig) : origConfig);
    tryUpdate(path.resolve(basedir, 'tsconfig.json'), expectedConfig);
    if (!files.includes('src')) continue;
    // Create mapping entry
    for (const file of fs.readdirSync(path.resolve(basedir, 'src'))) {
        if (!fs.statSync(path.resolve(basedir, 'src', file)).isFile()) continue;
        const name = file.split('.')[0];
        const filePath = path.resolve(basedir, `${name}.js`);
        if (name === 'index' && !fs.existsSync(filePath)) {
            tryUpdate(filePath, "module.exports = require('./src/index');\n");
        }
    }
}
tryUpdate(path.resolve(process.cwd(), 'tsconfig.ui.json'), UIConfig);
tryUpdate(path.resolve(process.cwd(), 'tsconfig.ui-next.json'), UINextConfig);
tryUpdate(path.resolve(process.cwd(), 'tsconfig.json'), config);
