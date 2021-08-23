import graphql from 'graphql';
import { typeDefs, resolvers } from 'graphql-scalars';
import { Handler, Route } from '../service/server';
import * as bus from '../service/bus';

const types: Record<string, Record<string, string>> = {};
const descriptions: Record<string, Record<string, string>> = {};
const handlers: Record<string, Record<string, any>> = {};
let root: Record<string, any> = {};

export function registerValue(typeName: string, key: string, value: string, description?: string): void;
export function registerValue(typeName: string, vals: [string, string, string?][]): void;
export function registerValue(typeName: string, arg1: [string, string, string?][] | string, value?: string, description?: string) {
    if (typeof arg1 === 'string') arg1 = [[arg1, value!, description]];
    for (const [k, v, d] of arg1) {
        if (!types[typeName]) types[typeName] = { [k]: v };
        else types[typeName][k] = v;
        if (d) {
            if (!descriptions[typeName]) descriptions[typeName] = { [k]: d };
            else descriptions[typeName][k] = d;
        }
    }
    bus.emit('api/update');
}

export function registerResolver(typeName: string, key: string, value: string, func: Function, description?: string) {
    registerValue(typeName, key, value, description);
    if (handlers[typeName]) handlers[typeName][key.split('(')[0].trim()] = func;
    else handlers[typeName] = { [key.split('(')[0].trim()]: func };
    bus.emit('api/update');
}

function setDescription(desc: string) {
    if (desc.includes('\n')) return ['"""', desc, '"""'].join('\n');
    return JSON.stringify(desc);
}

function buildSchemaStr() {
    let res = `${typeDefs.join('\n')}\n`;
    for (const key in types) {
        if (descriptions[key]._description) res += `${setDescription(descriptions[key]._description)}\n`;
        res += `type ${key}{\n`;
        for (const k in types[key]) {
            if (descriptions[key][k]) res += `  ${setDescription(descriptions[key][k])}\n`;
            res += `  ${k}: ${types[key][k]}\n`;
        }
        res += '}\n';
    }
    return res;
}

let schemaStr = buildSchemaStr();
let schema = graphql.buildSchema(schemaStr);
root = { ...handlers.Query, ...resolvers };

export function rebuild() {
    try {
        const str = buildSchemaStr();
        schema = graphql.buildSchema(str);
        schemaStr = str;
        root = { ...handlers.Query, ...resolvers };
    } catch (e) {
        console.error(e);
    }
}
bus.on('app/started', () => {
    rebuild();
    bus.on('api/update', rebuild);
});

class ApiHandler extends Handler {
    async get() {
        const q = decodeURIComponent(this.ctx.request.querystring);
        if (q === 'schema') {
            this.response.type = 'application/json';
            this.response.body = { schema: schemaStr };
        } else if (q) {
            this.response.type = 'application/json';
            this.response.body = await graphql.graphql(schema, q, root, this);
        } else this.response.template = 'api.html';
    }

    async post() {
        this.response.type = 'application/json';
        // FIXME validation for fields like ObjectID doesn't work.
        this.response.body = await graphql.graphql(schema, this.args.query, root, this, this.args.variables);
    }
}

export function apply() {
    Route('api', '/api', ApiHandler);
}

global.Hydro.handler.api = apply;
