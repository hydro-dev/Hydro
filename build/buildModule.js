const fs = require('fs');
const webpack = require('webpack');
const FriendlyErrorsPlugin = require('friendly-errors-webpack-plugin');
const root = require('./root');
const exist = (name) => {
    try {
        fs.statSync(root(name));
    } catch (e) {
        return false;
    }
    return true;
}
const build = async () => {
    const modules = fs.readdirSync(root('module'));
    const config = {
        mode: 'production',
        entry: {},
        output: {
            filename: 'module/[name].js',
            path: root('.build')
        },
        target: 'node',
        module: {},
        plugins: [
            new webpack.ProgressPlugin(),
            new FriendlyErrorsPlugin(),
        ]
    };
    for (let i of modules) {
        if (!i.startsWith('.')) {
            if (exist(`module/${i}/model.js`)) {
                config.entry[`${i}/model`] = root(`module/${i}/model.js`);
            }
            if (exist(`module/${i}/handler.js`)) {
                config.entry[`${i}/handler`] = root(`module/${i}/handler.js`);
            }
        }
    }
    const compiler = webpack(config);
    await new Promise((resolve, reject) => {
        compiler.run((err, stats) => {
            if (err) {
                console.error(err.stack || err);
                if (err.details) console.error(err.details);
                reject();
            }
            if (stats.hasErrors()) process.exitCode = 1;
            resolve();
        });
    })
}

module.exports = build;
