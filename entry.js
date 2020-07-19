const loader = require('./dist/loader');

function load(callback) {
    callback({ addon: loader.addon });
    loader.load().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}

load.load = loader.load;
load.addon = loader.addon;

module.exports = load;
