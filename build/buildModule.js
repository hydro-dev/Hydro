/* eslint-disable import/no-dynamic-require */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-await-in-loop */
const fs = require('fs');
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
    });
    for (const i of modules) {
        if (!i.startsWith('.')) {
            if (exist(`module/${i}/locale`)) {
                const locales = fs.readdirSync(root(`module/${i}/locale`));
                const lang = {};
                for (const j of locales) {
                    const content = fs.readFileSync(root(`module/${i}/locale/${j}`)).toString();
                    lang[j.split('.')[0]] = yaml.safeLoad(content);
                }
                const file = root(`.build/module/${i}/locale.json`);
                fs.writeFileSync(file, JSON.stringify(lang));
            }
            if (exist(`module/${i}/template.build.js`)) {
                const builder = require(root(`module/${i}/template.build.js`));
                const [templates, exclude] = await builder.prebuild();
                const file = root(`.build/module/${i}/template.yaml`);
                fs.writeFileSync(file, yaml.safeDump(template(templates, exclude)));
            } else if (exist(`module/${i}/template`)) {
                const file = root(`.build/module/${i}/template.yaml`);
                fs.writeFileSync(file, yaml.safeDump(template(`module/${i}/template`)));
            }
        }
    }
};

module.exports = build;
