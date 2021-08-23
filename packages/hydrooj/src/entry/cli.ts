/* eslint-disable no-await-in-loop */
/* eslint-disable import/no-dynamic-require */
import { ObjectID } from 'mongodb';
import cac from 'cac';
import {
    lib, service, model, script,
    builtinLib, builtinModel, builtinScript,
} from './common';
import options from '../options';
import { validate } from '../lib/validator';
import * as bus from '../service/bus';
import db from '../service/db';

const argv = cac().parse();
const COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
const ARR = /=>.*$/mg;
function parseParameters(fn: Function) {
    const code = fn.toString()
        .replace(COMMENTS, '')
        .replace(ARR, '');
    const result = code.slice(code.indexOf('(') + 1, code.indexOf(')'))
        .match(/([^,]+)/g).map((i) => i.trim());
    return result === null ? [] : result;
}

async function runScript(name: string, arg: any) {
    if (!global.Hydro.script[name]) return console.error('Script %s not found.', name);
    validate(global.Hydro.script[name].validate, arg);
    return await global.Hydro.script[name].run(arg, console.info);
}

async function cli() {
    const [, modelName, func, ...args] = argv.args as [string, string, string, ...any[]];
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
        } else if (args[i].length === 24 && ObjectID.isValid(args[i])) {
            args[i] = new ObjectID(args[i]);
        } else if ((+args[i]).toString() === args[i]) {
            args[i] = +args[i];
        } else if (args[i].startsWith('~')) {
            args[i] = argv.options[args[i].substr(1)];
        }
    }
    let result = global.Hydro.model[modelName][func](...args);
    if (result instanceof Promise) result = await result;
    return console.log(result);
}

export async function load() {
    const pending = global.addons;
    const fail = [];
    require('../lib/i18n');
    require('../utils');
    require('../error');
    require('../options');
    const opts = options();
    await db.start(opts);
    const storage = require('../service/storage');
    await storage.start();
    for (const i of builtinLib) require(`../lib/${i}`);
    await lib(pending, fail);
    const systemModel = require('../model/system');
    await systemModel.runConfig();
    require('../service/gridfs');
    await service(pending, fail);
    for (const i of builtinModel) require(`../model/${i}`);
    await model(pending, fail);
    for (const i of builtinScript) require(`../script/${i}`);
    await script(pending, fail, []);
    await bus.parallel('app/started');
    await cli();
}
