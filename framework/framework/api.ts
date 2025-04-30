import { Context, Service } from 'cordis';
import Schema from 'schemastery';
import { param } from './decorators';
import { BadRequestError, MethodNotAllowedError, NotFoundError } from './error';
import { } from './interface';
import { Handler } from './server';
import { Types } from './validator';

const BINARY = Symbol.for('hydro.api.response.binary');
const REDIRECT = Symbol.for('hydro.api.response.redirect');

export type ApiCall<Arg, Res> = {
    readonly type: 'Query' | 'Mutation';
    readonly input: Schema<Arg>;
    readonly func: (context: any, args: Arg) => Promise<Res> | Res;
    readonly hooks: ApiCall<Arg, void>[];
};

export const _get = (type: 'Query' | 'Mutation') => <Arg, Res>(
    schema: Schema<Arg>,
    func: (context: Handler, args: Arg) => Promise<Res> | Res,
    hooks: ApiCall<any, void>[] = [],
): ApiCall<Arg, Res> => ({ input: schema, func, hooks, type } as const); // eslint-disable-line

export const Query = _get('Query');
export const Mutation = _get('Mutation');

export class BinaryResponse {
    [BINARY]: true;
    constructor(public readonly data: Buffer, public filename: string) { }
    static check(value: any): value is BinaryResponse {
        return value && typeof value === 'object' && BINARY in value && value[BINARY] === true;
    }
}

export class RedirectResponse {
    [REDIRECT]: true;
    constructor(public readonly url: string) { }
    static check(value: any): value is RedirectResponse {
        return value && typeof value === 'object' && REDIRECT in value && value[REDIRECT] === true;
    }
}

/** @deprecated TODO */
export const NOP = Query(Schema.any(), () => { });

export const APIS = {
    'query.batch': Query(Schema.array(Schema.object({ op: Schema.string(), args: Schema.any() })), () => ({})),
    'mutation.batch': Mutation(Schema.array(Schema.object({ op: Schema.string(), args: Schema.any() })), () => ({})),
} as const;
export interface Apis {
    builtin: {
        'query.batch': ApiCall<{ op: string, args: any }[], { [key: string]: any }>;
        'mutation.batch': ApiCall<{ op: string, args: any }[], { [key: string]: any }>;
    }
}
export type FlattenedApis = Apis[keyof Apis];

// Thanks to @ForkKILLET for the projection function
type ProjectionSchemaId = 1;
type MKeyOf<T> = T extends any ? keyof T : never;
type MId<T> = { [K in MKeyOf<T>]: T[K] } & {};
type ProjectionSchema<T> = T extends Array<infer U>
    ? ProjectionSchema<U>
    : | { [K in keyof T]?: ProjectionSchemaId | ProjectionSchema<T[K]> }
    | Record<keyof any, ProjectionSchemaId | object>;
type AsKeys<T> = T extends Array<infer U extends string> ? Record<U, 1> : T;
type Projection<T, S> = S extends ProjectionSchemaId
    ? T : T extends Array<infer U> ? Array<MId<Projection<U, S>>> : {
        [K in keyof T & keyof S]: K extends keyof AsKeys<S> ? Projection<T[K], AsKeys<S>[K]> : never
    };

export const projection = <T, S extends ProjectionSchema<T>>(input: T, schema: S): Projection<T, S> => {
    if (typeof input !== 'object' || input === null) throw new Error('Input must be an object.');
    type R = Projection<T, S>;
    if (Array.isArray(schema)) schema = Object.fromEntries(schema.map((s) => [s, 1])) as S;
    if (Array.isArray(input)) {
        return input.map((item) => projection(item, schema)) as R;
    }
    const result = {} as R;
    for (const key of Reflect.ownKeys(input)) {
        const schemaIt = schema[key];
        if (!schemaIt) continue;
        if (schemaIt === 1 || !input[key]) result[key] = input[key];
        else result[key] = projection(input[key], schemaIt);
    }
    return result;
};

export interface ApiExecutionContext {
}

export class ApiService extends Service {
    constructor(ctx: Context) {
        super(ctx, 'api');
    }

    provide(calls: Partial<FlattenedApis>) {
        this.ctx.effect(() => {
            for (const key in calls) {
                APIS[key] = calls[key];
            }
            return () => {
                for (const key in calls) {
                    delete APIS[key];
                }
            };
        });
    }

    async execute(context: ApiExecutionContext, callOrName: ApiCall<any, any> | string, rawArgs: any, emitHook?: any, project?: any) {
        const call = typeof callOrName === 'string' ? APIS[callOrName] : callOrName;
        if (!call) throw new NotFoundError(callOrName);
        const { input, func, hooks } = call;
        // eslint-disable-next-line no-await-in-loop
        for (const hook of hooks) await this.execute(context, hook, rawArgs);

        let args: any;
        try {
            args = input ? input(rawArgs as any) : rawArgs;
        } catch (e) {
            throw new BadRequestError(e.message);
        }
        if (typeof callOrName === 'string') {
            await emitHook?.('api/before', args);
            await emitHook?.(`api/before/${callOrName}`, args);
        }
        const result = await func(context, args as any);
        return (project && typeof result === 'object' && result !== null) ? projection(result, project) : result;
    }
}

declare module 'cordis' {
    interface Context {
        api: ApiService;
    }
}

export class ApiHandler<C extends Context> extends Handler<C> {
    @param('op', Types.String)
    async all({ }, op: string) {
        if (!['get', 'post'].includes(this.request.method.toLowerCase())) {
            throw new MethodNotAllowedError(this.request.method);
        }
        if (!APIS[op]) throw new BadRequestError('Invalid operation');
        if (APIS[op].type === 'Mutation' && this.request.method.toLowerCase() === 'get') {
            throw new BadRequestError('Mutation operation cannot be called with GET method');
        }
        // @ts-ignore
        await this.ctx.parallel('handler/api/before', this);
        // @ts-ignore
        await this.ctx.parallel(`handler/api/before/${op}`, this);
        const result = await this.ctx.api.execute(
            this, op, { domainId: this.args.domainId, ...(this.args.args || {}) },
            (m, args) => (this.ctx.parallel as any)(m, args), this.args.projection,
        );
        if (BinaryResponse.check(result)) {
            this.binary(result.data, result.filename);
        } else if (RedirectResponse.check(result)) {
            this.response.redirect = result.url;
        } else {
            this.response.body = result;
        }
    }
}

export function applyApiHandler(ctx: Context, name: string, path: string) {
    ctx.plugin(ApiService);
    ctx.inject(['server', 'api'], ({ Route }) => {
        Route(name, path, ApiHandler);
    });
}
