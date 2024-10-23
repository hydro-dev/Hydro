import { makeExecutableSchema } from '@graphql-tools/schema';
import { getDirective, MapperKind, mapSchema } from '@graphql-tools/utils';
import { defaultFieldResolver, graphql, GraphQLSchema } from 'graphql';
import { resolvers, typeDefs } from 'graphql-scalars';
import { debounce } from 'lodash';
import { Context, Service } from '../context';
import { PERM, PRIV } from '../model/builtin';
import { Handler } from './server';

const types: Record<string, Record<string, string>> = {};
const unions: Record<string, string> = {};
const descriptions: Record<string, Record<string, string>> = {};
const handlers: Record<string, Record<string, any>> = {
    Query: {},
};
let root: Record<string, any> = {};

interface ApiContext extends ApiHandler {
    [key: string]: any;
}
declare module '../context' {
    interface Context {
        api: ApiService;
    }
}

function setDescription(desc: string) {
    if (desc.includes('\n')) return ['"""', desc, '"""'].join('\n');
    return JSON.stringify(desc);
}

let schema: GraphQLSchema;
let schemaStr = '';
root = handlers.Query;

const applyAuthDirective = (s) => mapSchema(s, {
    // eslint-disable-next-line consistent-return
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
        const authDirective = getDirective(s, fieldConfig, 'auth')?.[0];
        if (authDirective) {
            const { resolve = defaultFieldResolver } = fieldConfig;
            return {
                ...fieldConfig,
                async resolve(source, args, context, info) {
                    if (authDirective.perm) {
                        const perm = PERM[authDirective.perm];
                        if (!context.user.hasPerm(perm)) throw new Error(`Permission denied: ${authDirective.perm}`);
                    }
                    if (authDirective.priv) {
                        const priv = PRIV[authDirective.priv];
                        if (!context.user.hasPriv(priv)) throw new Error(`Permission denied: ${authDirective.priv}`);
                    }
                    return await resolve(source, args, context, info);
                },
            };
        }
        const ifDirective = getDirective(s, fieldConfig, 'if')?.[0];
        if (ifDirective) {
            const { resolve = defaultFieldResolver } = fieldConfig;
            return {
                ...fieldConfig,
                async resolve(source, args, context, info) {
                    if (ifDirective.perm && !context.user.hasPerm(PERM[ifDirective.perm])) return null;
                    if (ifDirective.priv && !context.user.hasPriv(PRIV[ifDirective.priv])) return null;
                    return await resolve(source, args, context, info);
                },
            };
        }
    },
});

class ApiHandler extends Handler {
    category = '#api';
    // FIXME: adding PERM_VIEW check will break omnibar search

    query(q: string, variables: any) {
        return graphql({
            schema,
            source: q,
            rootValue: root,
            contextValue: this,
            variableValues: variables,
        });
    }

    async get() {
        const q = decodeURIComponent(this.request.querystring);
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

/** @deprecated use ctx.api.value() instead */
export function registerValue(...args: any[]) {
    // @ts-ignore
    return app.api.value(...args);
}

/** @deprecated use ctx.api.resolver() instead */
export function registerResolver(...args: any[]) {
    // @ts-ignore
    return app.api.resolver(...args);
}

/** @deprecated use ctx.api.union() instead */
export function registerUnion(...args: any[]) {
    // @ts-ignore
    return app.api.resolver(...args);
}

// TODO support dispose
class ApiService extends Service {
    constructor(ctx: Context) {
        super(ctx, 'api', true);
        this.rebuild = debounce(this.rebuild.bind(this), 500, { trailing: true });
        ctx.on('ready', this.rebuild);
    }

    private rebuild() {
        try {
            const defs = [
                ...Object.keys(unions).map((i) => `union ${i} = ${unions[i]}`),
                'directive @auth(perm: String, priv: String) on FIELD_DEFINITION',
                'directive @if(perm: String, priv: String) on FIELD_DEFINITION',
                ...typeDefs,
                ...Object.keys(types).map((key) => {
                    let def = '';
                    if (descriptions[key]?._description) def += `${setDescription(descriptions[key]._description)}\n`;
                    def += `type ${key} {\n`;
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
            schema = applyAuthDirective(schema);
            schemaStr = defs.join('\n');
        } catch (e) {
            console.error(e);
        }
        this.ctx.emit('api/update');
    }

    value(typeName: string, key: string, value: string, description?: string): void;
    value(typeName: string, vals: [string, string, string?][]): void;
    value(typeName: string, arg1: [string, string, string?][] | string, value?: string, description?: string) {
        if (typeof arg1 === 'string') arg1 = [[arg1, value!, description]];
        for (const [k, v, d] of arg1) {
            if (!types[typeName]) types[typeName] = { [k]: v };
            else types[typeName][k] = v;
            if (d) {
                if (!descriptions[typeName]) descriptions[typeName] = { [k]: d };
                else descriptions[typeName][k] = d;
            }
        }
        this.rebuild();
    }

    resolver(
        typeName: string, key: string, value: string,
        func: (args: any, ctx: ApiContext, info: any) => any,
        description?: string,
    ) {
        this.value(typeName, key, value, description);
        const wrappedFunc = async (arg, ctx, info) => {
            const res = await func(arg, ctx, info);
            if (typeof res !== 'object' || res === null) return res;
            let node = value.includes('!') ? value.split('!')[0] : value;
            const isArray = node.includes('[');
            node = node.replace('[', '').replace(']', '');
            if (handlers[node]) {
                if (!isArray) Object.assign(res, handlers[node]);
                else if (res instanceof Array) for (const i of res) { Object.assign(i, handlers[node]); }
            }
            ctx.parent = res;
            return res;
        };
        handlers[typeName] ||= {};
        handlers[typeName][key.split('(')[0].trim()] = wrappedFunc;
        this.rebuild();
    }

    union(typeName: string, ...unionTypes: string[]) {
        unions[typeName] = unionTypes.join(' | ');
        this.rebuild();
    }

    query(query: string, args: Record<string, any>) {
        return graphql({
            schema,
            source: query,
            rootValue: root,
            contextValue: this,
            variableValues: args,
        });
    }
}

export const sideEffect = true;
export const using = ['server'];

export function apply(ctx: Context) {
    ctx.plugin(ApiService);
    ctx.Route('api', '/api', ApiHandler);
}
