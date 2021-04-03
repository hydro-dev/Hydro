const fs = require('fs');
const path = require('path');
const child = require('child_process');
const { argv } = require('yargs');

const compilerOptionsBase = {
    target: 'es2019',
    module: 'commonjs',
    esModuleInterop: true,
    moduleResolution: 'node',
    declaration: true,
    sourceMap: true,
    composite: true,
    strictBindCallApply: true,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
};
const config = {
    compilerOptions: compilerOptionsBase,
    references: [
        { path: 'tsconfig.build.json' },
        { path: 'packages/hydrooj' },
    ],
    files: [],
};
const configSrc = {
    compilerOptions: {
        ...compilerOptionsBase,
        outDir: 'dist',
        rootDir: 'src',
    },
    include: ['src'],
    exclude: [
        '**/__mocks__',
        'bin',
        'dist',
    ],
};
const configFlat = {
    compilerOptions: {
        ...compilerOptionsBase,
        outDir: '.',
        rootDir: '.',
    },
    include: ['**/*.ts'],
    exclude: [],
};

const packages = fs.readdirSync(path.resolve(process.cwd(), 'packages'));
console.log(packages);
for (const package of packages) {
    if (package === 'ui-default') continue;
    const basedir = path.resolve(process.cwd(), 'packages', package);
    const files = fs.readdirSync(basedir);
    if (!files.includes('src') && !files.map(n => n.split('.')[1]).includes('ts') && package !== 'utils') continue;
    if (package !== 'hydrooj') config.references.push({ path: `packages/${package}` });
    fs.writeFileSync(
        path.resolve(basedir, 'tsconfig.json'),
        files.includes('src') ? JSON.stringify(configSrc) : JSON.stringify(configFlat),
    );
    if (files.includes('src')) {
        const inner = fs.readdirSync(path.resolve(basedir, 'src'));
        for (const file of inner) {
            if (!fs.statSync(path.resolve(basedir, 'src', file)).isFile()) continue;
            const name = file.split('.')[0];
            if (['handler', 'service', 'lib', 'model', 'script'].includes(name)) {
                fs.writeFileSync(path.resolve(basedir, name + '.js'), `module.exports = require('./dist/${name}');\n`);
            }
        }
    }
}
fs.writeFileSync(path.resolve(process.cwd(), 'tsconfig.json'), JSON.stringify(config));

child.execSync('./node_modules/.bin/tsc -b packages/hydrooj', { stdio: 'inherit' });

if (argv.watch) {
    child.execSync('./node_modules/.bin/tsc -b --watch', { stdio: 'inherit' });
} else {
    child.execSync('./node_modules/.bin/tsc -b', { stdio: 'inherit' });
}