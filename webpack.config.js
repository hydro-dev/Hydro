const config = {
    mode: 'production',
    entry: {
        development: './hydro/development.js',
        install: './hydro/install.js',
        uninstall: './hydro/uninstall.js'
    },
    output: {
        filename: '[name].js',
        path: __dirname + '/dist'
    },
    target: 'node',
    module: {}
};

module.exports = config;
