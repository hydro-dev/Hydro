/* eslint-disable import/no-dynamic-require */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-await-in-loop */
const fs = require('fs');
const zlib = require('zlib');
const webpack = require('webpack');
const yaml = require('js-yaml');
const FriendlyErrorsPlugin = require('friendly-errors-webpack-plugin');
const root = require('./root');
const template = require('./template');

const exist = (name) => {
    try {
        fs.statSync(root(name));
    } catch (e) {
        return false;
    }
    return true;
};
const build = async (type) => {
    const modules = fs.readdirSync(root('module'));
    const config = {
        mode: type,
        entry: {},
        output: {
            filename: 'module/[name].js',
            path: root('.build'),
        },
        target: 'node',
        module: {},
        plugins: [
            new webpack.ProgressPlugin(),
            new FriendlyErrorsPlugin(),
        ],
    };
    for (const i of modules) {
        if (!i.startsWith('.')) {
            const prepare = ['model', 'lib', 'handler', 'service'];
            for (const j of prepare) {
                if (exist(`module/${i}/${j}.js`)) {
                    const file = fs.readFileSync(root(`module/${i}/${j}.js`));
                    if (file.includes('require')) {
                        config.entry[`${i}/${j}`] = root(`module/${i}/${j}.js`);
                    }
                }
            }
        }
    }
    const compiler = webpack(config);
    for (const i of modules) {
        if (exist(`module/${i}/build.js`)) {
            const builder = require(root(`module/${i}/build.js`));
            if (builder.prebuild) await builder.prebuild();
        }
    }
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
    });
    for (const i of modules) {
        if (!i.startsWith('.')) {
            const current = {};
            const prepare = ['model', 'lib', 'handler', 'service'];
            for (const j of prepare) {
                if (exist(`module/${i}/${j}.js`)) {
                    const file = fs.readFileSync(root(`module/${i}/${j}.js`));
                    if (file.includes('require')) {
                        current[j] = fs.readFileSync(root(`.build/module/${i}/${j}.js`)).toString();
                    } else {
                        current[j] = fs.readFileSync(root(`module/${i}/${j}.js`)).toString();
                    }
                }
            }
            if (exist(`module/${i}/locale`)) {
                const locales = fs.readdirSync(root(`module/${i}/locale`));
                const lang = {};
                for (const j of locales) {
                    const content = fs.readFileSync(root(`module/${i}/locale/${j}`)).toString();
                    lang[j.split('.')[0]] = yaml.safeLoad(content);
                }
                current.locale = lang;
            }
            if (exist(`module/${i}/template`)) {
                current.template = template(`module/${i}/template`);
            }
            const m = require(root(`module/${i}/hydro.json`));
            current.description = m.description || '';
            current.requirements = m.requirements || [];
            current.version = m.version || 'unknown';
            const data = zlib.gzipSync(Buffer.from(yaml.safeDump(current)), { level: 3 });
            fs.writeFileSync(root(`.build/module/${i}.hydro`), data);
        }
    }
};

module.exports = build;
