const path = require('path');
const fs = require('fs');
const webpack = require('webpack');
const root = require('./root');
const build = async (next) => {
    const modules = fs.readdirSync(root('hydro', 'module'));
    const config = {
        mode: 'production',
        entry: {
            development: root('hydro/development.js'),
            install: root('hydro/install.js'),
            uninstall: root('hydro/uninstall.js')
        },
        output: {
            filename: '[name].js',
            path: root('.build')
        },
        target: 'node',
        module: {}
    };
    for (let i of modules) {
        if (fs.statSync(path.resolve(__dirname, 'hydro', 'module', i)).isDirectory()) {
            config.entry[root(`.build/module/${i}`)] = root(`./hydro/module/${i}/index.js`);
        } else {
            config.entry[root(`.build/module/${i}`)] = root(`./hydro/module/${i}`);
        }
    }
    const compiler = webpack(config);
    function compilerCallback(err, stats) {
        if (err) {
            console.error(err.stack || err);
            if (err.details) console.error(err.details);
            process.exit(1);
        }
    }
    if (!watch && stats.hasErrors()) process.exitCode = 1;
    compiler.run(compilerCallback);
    next({ total: 100 });
}
module.exports = build;
