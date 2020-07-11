/* eslint-disable import/no-extraneous-dependencies */
const path = require('path');
const webpack = require('webpack');
const FriendlyErrorsPlugin = require('friendly-errors-webpack-plugin');
const { root } = require('./utils');

const build = async (type) => {
    const config = {
        mode: type,
        entry: {
            app: root('hydro/loader.ts'),
        },
        output: {
            filename: '[name].js',
            path: root('.build'),
        },
        target: 'node',
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    exclude: /node_modules/,
                    use: [
                        {
                            loader: 'cache-loader',
                            options: {
                                cacheDirectory: path.resolve(__dirname, '..', '.cache', 'ts'),
                            },
                        },
                        'ts-loader',
                    ],
                },
            ],
        },
        resolve: { extensions: ['.js', '.ts'] },
        plugins: [
            new webpack.ProgressPlugin(),
            new FriendlyErrorsPlugin({
                clearConsole: false,
            }),
        ],
    };
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
};

module.exports = build;
