import serialize from 'serialize-javascript';

function wrap(func: Function, type: string) {
    return (...args: any) => {
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
                global.Hydro.model.message.send(1, 1, serialize({ time, type, args }), 0);
            } catch (e) {
                func(e.message);
            }
        }
    };
}

class Logger {
    log: (...args: any[]) => void;

    error: (...args: any[]) => void;

    info: (...args: any[]) => void;

    warn: (...args: any[]) => void;

    debug: (...args: any[]) => void;

    constructor() {
        this.log = wrap(console.log, 'log');
        this.error = wrap(console.error, 'error');
        this.info = wrap(console.info, 'info');
        this.warn = wrap(console.warn, 'warn');
        this.debug = wrap(console.debug, 'debug');
    }
}

const exp = new Logger();

global.Hydro.lib.logger = exp;

export default exp;
