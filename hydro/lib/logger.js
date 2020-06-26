const yaml = require('js-yaml');

function warp(func, type) {
    return (...args) => {
        const time = new Date();
        func(...args);
        if (global.Hydro.model.message) {
            try {
                for (let i = 0; i <= args.length; i++) {
                    if (args[i] instanceof Error) {
                        // js-yaml cannot dump [object Error]
                        args[i] = `${args[i].message}\n${args[i].stack}`;
                    }
                }
                global.Hydro.model.message.send(1, 1, yaml.dump({ time, type, args }, {}));
            } catch (e) {
                func(e.message);
            }
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
