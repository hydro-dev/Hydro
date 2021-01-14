const locales = {};

declare global {
    interface String {
        format: (...args: Array<any>) => string;
        formatFromArray: (args: any[]) => string;
        rawformat: (object: any) => string;
        translate: (...languages: string[]) => string;
    }
}

String.prototype.format = function formatStr(...args) {
    let result = this;
    if (args.length > 0) {
        if (args.length === 1 && typeof (args[0]) === 'object') {
            for (const key in args) {
                if (args[key] !== undefined) {
                    const reg = new RegExp(`(\\{${key}\\})`, 'g');
                    result = result.replace(reg, args[key]);
                }
            }
        } else return this.formatFromArray(args);
    }
    return result;
};

String.prototype.formatFromArray = function formatStr(args) {
    let result = this;
    for (let i = 0; i < args.length; i++) {
        if (args[i] !== undefined) {
            const reg = new RegExp(`(\\{)${i}(\\})`, 'g');
            result = result.replace(reg, args[i]);
        }
    }
    return result;
};

String.prototype.rawformat = function rawFormat(object) {
    const res = this.split('{@}');
    return [res[0], object, res[1]].join();
};

String.prototype.translate = function translate(...languages: string[]) {
    for (const language of languages) {
        if (!language) continue;
        const curr = (locales[language] || {})[this] || (locales[language.split('_')[0]] || {})[this];
        if (curr) return curr;
    }
    return this;
};

function load(data: Record<string, Record<string, string>>) {
    for (const i in data) {
        if (!locales[i]) locales[i] = { __id: i, ...data[i] };
        else locales[i] = Object.assign(locales[i], data[i]);
    }
}

export = load;

global.Hydro.locales = locales;
global.Hydro.lib.i18n = load;
