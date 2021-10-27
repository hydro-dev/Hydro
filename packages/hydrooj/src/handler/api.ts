import { makeExecutableSchema } from '@graphql-tools/schema';
import { graphql, GraphQLSchema } from 'graphql';
import { resolvers, typeDefs } from 'graphql-scalars';
import * as bus from '../service/bus';
import { Handler, Route } from '../service/server';

const types: Record<string, Record<string, string>> = {};
const unions: Record<string, string> = {};
const descriptions: Record<string, Record<string, string>> = {};
const handlers: Record<string, Record<string, any>> = {
    Query: {},
};
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

interface Context extends ApiHandler {
    [key: string]: any;
}

export function registerResolver(typeName: string, key: string, value: string, func: (args: any, ctx: Context) => any, description?: string) {
    registerValue(typeName, key, value, description);
    const wrappedFunc = async (arg, ctx) => {
        const res = await func(arg, ctx);
        if (typeof res !== 'object') return res;
        if (handlers[value]) Object.assign(res, handlers[value]);
        return res;
    };
    if (handlers[typeName]) handlers[typeName][key.split('(')[0].trim()] = wrappedFunc;
    else handlers[typeName] = { [key.split('(')[0].trim()]: wrappedFunc };
    bus.emit('api/update');
}

export function registerUnion(typeName: string, ...unionTypes: string[]) {
    unions[typeName] = unionTypes.join(' | ');
    bus.emit('api/update');
}

function setDescription(desc: string) {
    if (desc.includes('\n')) return ['"""', desc, '"""'].join('\n');
    return JSON.stringify(desc);
}

let schema: GraphQLSchema;
let schemaStr = '';
root = handlers.Query;

export function rebuild() {
    try {
        const defs = [
            ...Object.keys(unions).map((i) => `union ${i} = ${unions[i]}`),
            ...typeDefs,
            ...Object.keys(types).map((key) => {
                let def = '';
                if (descriptions[key]?._description) def += `${setDescription(descriptions[key]._description)}\n`;
                def += `type ${key}{\n`;
                for (const k in types[key]) {
                    if (descriptions[key]?.[k]) def += `  ${setDescription(descriptions[key][k])}\n`;
                    def += `  ${k}: ${types[key][k]}\n`;
                }
                def += '}\n';
                return def;
            }),
        ];
        schema = makeExecutableSchema({
            typeDefs: defs,
            resolvers,
        });
        schemaStr = defs.join('\n');
    } catch (e) {
        console.error(e);
    }
}
bus.on('app/started', () => {
    rebuild();
    bus.on('api/update', rebuild);
});

class ApiHandler extends Handler {
    async query(q: string, variables: any) {
        // FIXME validation for fields like ObjectID doesn't work.
        return graphql(schema, q, root, this, variables);
    }

    async get() {
        const q = decodeURIComponent(this.ctx.request.querystring);
        if (q === 'schema') {
            this.response.type = 'application/json';
            this.response.body = { schema: schemaStr };
        } else if (q) {
            this.response.type = 'application/json';
            this.response.body = await this.query(q, {});
        } else this.response.template = 'api.html';
    }

    async post() {
        this.response.type = 'application/json';
        this.response.body = await this.query(this.args.query, this.args.variables);
    }
}

export function apply() {
    Route('api', '/api', ApiHandler);
}

global.Hydro.handler.api = apply;
