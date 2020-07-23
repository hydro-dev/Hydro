/* eslint-disable no-eval */
/* eslint-disable no-await-in-loop */
/* eslint-disable import/no-dynamic-require */
import { argv } from 'yargs';
import {
    lib, service, model, script,
    builtinLib, builtinScript, builtinModel,
} from './common';

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

async function cli() {
    const [, modelName, func, ...args] = argv._;
    if (!global.Hydro.model[modelName]) {
        return console.error(`Model ${modelName} doesn't exist.`);
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
    let result = global.Hydro.model[modelName][func](...args);
    if (result instanceof Promise) result = await result;
    return console.log(result);
}

export async function load(call, args) {
    let pending = args;
    const fail = [];
    const active = [];
    require('../lib/i18n');
    require('../utils');
    require('../error');
    require('../options');
    const bus = require('../service/bus');
    await new Promise((resolve) => {
        const h = () => {
            bus.unsubscribe(['system_database_connected'], h);
            resolve();
        };
        bus.subscribe(['system_database_connected'], h);
        require('../service/db');
    });
    for (const i of builtinLib) require(`../lib/${i}`);
    await lib(pending, fail);
    require('../service/gridfs');
    await service(pending, fail);
    for (const i of builtinModel) require(`../model/${i}`);
    await model(pending, fail);
    for (const i in global.Hydro.service) {
        if (global.Hydro.service[i].postInit) {
            try {
                await global.Hydro.service[i].postInit();
            } catch (e) {
                console.error(e);
            }
        }
    }
    for (const i of builtinScript) require(`../script/${i}`);
    await script(pending, fail, active);
    for (const postInit of global.Hydro.postInit) {
        await postInit();
    }
    pending = [];
    await cli();
    return { active, fail };
}
