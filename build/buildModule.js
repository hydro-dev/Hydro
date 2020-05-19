/* eslint-disable import/no-dynamic-require */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-await-in-loop */
const fs = require('fs');
const zlib = require('zlib');
const webpack = require('webpack');
const yaml = require('js-yaml');
const FriendlyErrorsPlugin = require('friendly-errors-webpack-plugin');
const { root, exist } = require('./utils');
const template = require('./template');

const prepare = ['model', 'lib', 'handler', 'service', 'script'];

const build = async (type) => {
    const modules = fs.readdirSync(root('module'));
    const failed = [];
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
            new FriendlyErrorsPlugin({
                clearConsole: false,
            }),
        ],
    };
    for (const i of modules) {
        if (!i.startsWith('.')) {
            try {
                if (exist(`module/${i}/build.js`)) {
                    const builder = require(root(`module/${i}/build.js`));
                    if (builder.prebuild) await builder.prebuild();
                }
                for (const j of prepare) {
                    if (exist(`module/${i}/${j}.js`)) {
                        config.entry[`${i}/${j}`] = root(`module/${i}/${j}.js`);
                    }
                }
            } catch (e) {
                console.error(`Module build fail: ${i}`);
                console.error(e);
                failed.push(i);
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
    });
    for (const i of modules) {
        if (!i.startsWith('.') && !failed.includes(i)) {
            try {
                const current = {};
                for (const j of prepare) {
                    if (exist(`module/${i}/${j}.js`)) {
                        current[j] = fs.readFileSync(root(`.build/module/${i}/${j}.js`)).toString();
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
                if (exist(`module/${i}/file`)) {
                    const files = fs.readdirSync(root(`module/${i}/file`));
                    current.file = {};
                    for (const file of files) {
                        current.file[file] = fs.readFileSync(root(`module/${i}/file/${file}`)).toString('base64');
                    }
                }
                const m = require(root(`module/${i}/hydro.json`));
                current.description = m.description || '';
                current.requirements = m.requirements || [];
                current.version = m.version || 'unknown';
                current.id = m.id;
                if (m.os) current.os = m.os;
                const data = zlib.gzipSync(Buffer.from(yaml.safeDump(current)), { level: -1 });
                fs.writeFileSync(root(`.build/module/${i}.hydro`), data);
            } catch (e) {
                console.error(`Module build fail: ${i}`);
                console.error(e);
            }
        }
    }
};

module.exports = build;
