import os from 'os';
import path from 'path';
import cac from 'cac';
import fs from 'fs-extra';
import { ObjectId } from 'mongodb';
import { Context } from '../context';
import { load as loadOptions } from '../options';
import { MongoService } from '../service/db';
import { SettingService } from '../settings';
import {
    addon, builtinModel, model, service,
} from './common';

const argv = cac().parse();
const tmpdir = path.resolve(os.tmpdir(), 'hydro');
const COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/gm;
const ARR = /=>.*$/gm;
function parseParameters(fn: Function) {
    const code = fn.toString()
        .replace(COMMENTS, '')
        .replace(ARR, '');
    const result = code.slice(code.indexOf('(') + 1, code.indexOf(')'))
        .match(/([^,]+)/g)?.map((i) => i.trim());
    return result ?? [];
}

async function runScript(name: string, arg: any) {
    const s = global.Hydro.script[name];
    if (!s) return console.error('Script %s not found.', name);
    if (typeof s.validate === 'function') arg = s.validate(arg);
    return await s.run(arg, console.info);
}

async function cli() {
    const [, modelName, func, ...args] = argv.args as [string, string, string, ...any[]];
    if (modelName === 'execute') {
        try {
            // eslint-disable-next-line no-eval
            const res = eval(`(async () => { with (require('${require.resolve('../plugin-api')}')) { ${func} } })`);
            return console.log(await res());
        } catch (e) {
            console.error(`Execution fail: ${e.message}`);
        }
    }
    if (modelName === 'script') {
        let arg: any;
        console.log(args.join(' '));
        try {
            arg = JSON.parse(args.join(' '));
        } catch (e) {
            return console.error('Invalid argument');
        }
        return await runScript(func, arg);
    }
    if (!global.Hydro.model[modelName]) {
        return console.error(`Model ${modelName} doesn't exist.`);
    }
    if (!func) {
        return console.log(Object.keys(global.Hydro.model[modelName]));
    }
    if (!global.Hydro.model[modelName][func]) {
        return console.error(`Function ${func} doesn't exist in model ${modelName}.`);
    }
    if (typeof global.Hydro.model[modelName][func] !== 'function') {
        return console.error(`${func} in model ${modelName} is not a function.`);
    }
    const parameterMin = global.Hydro.model[modelName][func].length;
    const parameters = parseParameters(global.Hydro.model[modelName][func]);
    const parameterMax = parameters.length;
    if (args.length > parameterMax) {
        console.error(`Too many arguments. Max ${parameterMax}`);
        return console.error(parameters.join(', '));
    }
    if (args.length < parameterMin) {
        console.error(`Too few arguments. Min ${parameterMin}`);
        return console.error(parameters.join(', '));
    }
    for (let i = 0; i < args.length; i++) {
        if ("'\"".includes(args[i][0]) && "'\"".includes(args[i][args[i].length - 1])) {
            args[i] = args[i].substr(1, args[i].length - 2);
        } else if (args[i].length === 24 && ObjectId.isValid(args[i])) {
            args[i] = new ObjectId(args[i]);
        } else if ((+args[i]).toString() === args[i]) {
            args[i] = +args[i];
        } else if (args[i].startsWith('~')) {
            args[i] = argv.options[args[i].substr(1)];
        } else if ((args[i].startsWith('[') && args[i].endsWith(']')) || (args[i].startsWith('{') && args[i].endsWith('}'))) {
            try {
                args[i] = JSON.parse(args[i]);
                for (const key in args[i]) {
                    if (typeof args[i][key] === 'string' && ObjectId.isValid(args[i][key])) {
                        args[i][key] = new ObjectId(args[i][key]);
                    }
                }
            } catch (e) {
                console.error(`Cannot parse argument at position ${i}`);
            }
        }
    }
    let result = global.Hydro.model[modelName][func](...args);
    if (result instanceof Promise) result = await result;
    return console.log(result);
}

export async function load(ctx: Context) {
    fs.ensureDirSync(tmpdir);
    require('../utils');
    require('../error');
    require('../service/bus').apply(ctx);
    const pending = global.addons;
    const fail = [];
    await ctx.plugin(MongoService, loadOptions() || {});
    await ctx.plugin(SettingService);
    await require('../model/system').runConfig();
    ctx = await new Promise((resolve) => {
        ctx.inject(['loader', 'setting', 'db'], (c) => {
            resolve(c);
        });
    });
    await Promise.all([
        ctx.loader.reloadPlugin(require.resolve('../service/storage'), 'file'),
        ctx.loader.reloadPlugin(require.resolve('../service/worker'), 'worker'),
        ctx.loader.reloadPlugin(require.resolve('../service/server'), 'server'),
    ]);
    require('../lib/index');
    await service(pending, fail, ctx);
    await builtinModel(ctx);
    await model(pending, fail, ctx);
    ctx = await new Promise((resolve) => {
        ctx.inject(['server', 'worker'], (c) => {
            resolve(c);
        });
    });
    await addon(pending, fail, ctx);
    const scriptDir = path.resolve(__dirname, '..', 'script');
    await Promise.all((await fs.readdir(scriptDir))
        .map((h) => ctx.loader.reloadPlugin(path.resolve(scriptDir, h), '')));
    await cli();
}
