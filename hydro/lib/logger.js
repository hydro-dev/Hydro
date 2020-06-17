const yaml = require('js-yaml');

function warp(func, type) {
    return (...args) => {
        const time = new Date();
        func(...args);
        if (global.Hydro.model.message) {
            global.Hydro.model.message.send(1, 1, yaml.safeDump({ time, type, args }));
        }
    };
}

class Logger {
    constructor() {
        this.log = warp(console.log, 'log');
        this.error = warp(console.error, 'error');
        this.info = warp(console.info, 'info');
        this.warn = warp(console.warn, 'warn');
        this.debug = warp(console.debug, 'debug');
    }
}

global.Hydro.lib.logger = module.exports = new Logger();
