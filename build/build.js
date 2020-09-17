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
    include: [
        'src',
    ],
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
    include: [
        '*.ts',
    ],
    exclude: [],
};

const packages = fs.readdirSync(path.resolve(process.cwd(), 'packages'));
console.log(packages);
for (const package of packages) {
    if (package !== 'hydrooj') config.references.push({ path: `packages/${package}` });
    const files = fs.readdirSync(path.resolve(process.cwd(), 'packages', package));
    fs.writeFileSync(
        path.resolve(process.cwd(), 'packages', package, 'tsconfig.json'),
        files.includes('src') ? JSON.stringify(configSrc) : JSON.stringify(configFlat),
    );
}
fs.writeFileSync(path.resolve(process.cwd(), 'tsconfig.json'), JSON.stringify(config));

if (argv.watch) {
    child.spawnSync('../node_modules/.bin/tsc -b --watch', { stdio: 'inherit' });
} else {
    let result = child.spawnSync('../node_modules/.bin/tsc -b', { stdio: 'inherit' });
    if (result.status != 0) {
        result = child.spawnSync('../node_modules/.bin/tsc -b', { stdio: 'inherit' });
    }
    console.log(result);
    process.exit(result.status);
}