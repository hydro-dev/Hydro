import { Context, Service } from 'cordis';
import Schema from 'schemastery';
import { param } from './decorators';
import { BadRequestError, MethodNotAllowedError, NotFoundError } from './error';
import { } from './interface';
import { ConnectionHandler, Handler } from './server';
import { Types } from './validator';

const BINARY = Symbol.for('hydro.api.response.binary');
const REDIRECT = Symbol.for('hydro.api.response.redirect');

type MaybePromise<T> = T | Promise<T>;
export type ApiType = 'Query' | 'Mutation' | 'Subscription';
export interface ApiCall<Type extends ApiType, Arg, Res, Progress = never> {
    readonly type: Type;
    readonly input: Schema<Arg>;
    readonly func: (Type extends 'Subscription'
        ? (context: any, args: Arg, emit: (payload: Res) => void) => (() => MaybePromise<void>)
        : (context: any, args: Arg) => MaybePromise<Res | AsyncGenerator<Progress, Res, never>>);
    readonly hooks: ApiCall<'Query', Arg, void>[];
}

export const _get = <Type extends ApiType>(type: Type) => <Arg, Res, Progress>(
    schema: Schema<Arg>,
    func: ApiCall<Type, Arg, Res, Progress>['func'],
    hooks: ApiCall<'Query', Arg, void, never>[] = [],
): ApiCall<Type, Arg, Res, Progress> => ({ input: schema, func, hooks, type } as const);

export const Query = _get('Query');
export const Mutation = _get('Mutation');
export const Subscription = _get('Subscription');

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
        'query.batch': ApiCall<'Query', { op: string, args: any }[], { [key: string]: any }>;
        'mutation.batch': ApiCall<'Mutation', { op: string, args: any }[], { [key: string]: any }>;
    };
    test: typeof TestApis;
}
export type FlattenedApis = Apis[keyof Apis];

// Thanks to @ForkKILLET for the projection function
type ProjectionSchemaId = 1;
type MKeyOf<T> = T extends any ? keyof T : never;
type MId<T> = { [K in MKeyOf<T>]: T[K] } & {};
type ProjectionSchema<T> = T extends Array<infer U>
    ? ProjectionSchema<U>
    : { [K in keyof T]?: ProjectionSchemaId | ProjectionSchema<T[K]> } | Record<keyof any, ProjectionSchemaId | object>;
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

function handleArguments(args: any) {
    try {
        if (typeof args.args === 'string') {
            args.args = JSON.parse(args.args);
        }
        if (typeof args.projection === 'string') {
            args.projection = '{['.includes(args.projection[0])
                ? JSON.parse(args.projection)
                : args.projection.split(',').map((i) => i.trim()).filter((i) => i);
        }
    } catch (e) {
        throw new BadRequestError('Invalid arguments');
    }
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

    async execute(
        context: ApiExecutionContext, callOrName: ApiCall<ApiType, any, any> | string,
        rawArgs: any, emitHook?: any, project?: any, sendPayload?: (payload: any) => void,
    ) {
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
        let result = await func(context, args as any, sendPayload);
        if (result && typeof result === 'object' && 'next' in result) {
            const it = result as AsyncGenerator<any, any, never>;
            while (true) {
                const value = await it.next(); // eslint-disable-line no-await-in-loop
                if (value.done) {
                    result = value;
                    break;
                } else {
                    sendPayload?.(value.value);
                }
            }
        }
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
        if (APIS[op].type === 'Subscription') {
            throw new BadRequestError('Subscription operation cannot be called in HTTP handler');
        }
        if (APIS[op].type === 'Mutation' && this.request.method.toLowerCase() === 'get') {
            throw new BadRequestError('Mutation operation cannot be called with GET method');
        }
        handleArguments(this.args);
        // @ts-ignore
        await this.ctx.parallel('handler/api/before', this);
        // @ts-ignore
        await this.ctx.parallel(`handler/api/before/${op}`, this);
        const result = await this.ctx.api.execute(
            this, op, { domainId: this.args.domainId, ...this.args, ...(this.args.args || {}) },
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

export class ApiConnectionHandler<C extends Context> extends ConnectionHandler<C> {
    dispose: () => Promise<void> | void;
    isRpc: boolean;

    @param('op', Types.String)
    async prepare({ }, op: string) {
        if (op === 'rpc') {
            this.isRpc = true;
            return;
        }
        if (!APIS[op]) throw new BadRequestError('Invalid operation');
        if (APIS[op].type !== 'Subscription') {
            throw new BadRequestError('Only subscription operations are supported');
        }
        handleArguments(this.args);
        // @ts-ignore
        await this.ctx.parallel('handler/api/before', this);
        // @ts-ignore
        await this.ctx.parallel(`handler/api/before/${op}`, this);
        this.dispose = await this.ctx.api.execute(
            this, op, { domainId: this.args.domainId, ...this.args, ...(this.args.args || {}) },
            (m, args) => (this.ctx.parallel as any)(m, args), this.args.projection, (p) => this.send(p),
        );
    }

    async message(message) {
        if (!this.isRpc) throw new BadRequestError('Only RPC operations are supported');
        if (typeof message === 'string') {
            try {
                message = JSON.parse(message);
            } catch (e) {
                throw new BadRequestError('Invalid message');
            }
        }
        if (!APIS[message.op]) throw new BadRequestError('Invalid operation');
        if (APIS[message.op].type !== 'Subscription') {
            throw new BadRequestError('Only subscription operations are supported');
        }
        handleArguments(message);
        const result = await this.ctx.api.execute(
            this, message.op, message.args, (m, args) => (this.ctx.parallel as any)(m, args), message.projection,
        );
        this.send(result);
    }

    async cleanup() {
        await this.dispose?.();
    }
}

export function applyApiHandler(ctx: Context, name: string, path: string) {
    ctx.plugin(ApiService);
    ctx.inject(['server', 'api'], ({ Route, Connection }) => {
        Route(name, path, ApiHandler);
        Connection(`${name}_conn`, `${path}/conn`, ApiConnectionHandler);
    });
}

const TestApis = {
    'test.query': Query(Schema.object({
        name: Schema.string(),
    }), (c, { name }) => ({
        ok: true,
        name,
    })),
    'test.mutation': Mutation(Schema.object({
        name: Schema.string().required(),
    }), (c, { name }) => ({
        ok: true,
        name,
    })),
    'test.mutation_progress': Mutation(Schema.object({
        count: Schema.number().step(1).min(1).default(10),
    }), async function* (c, { count }) {
        for (let i = 1; i <= count; i++) {
            yield { progress: i };
        }
        return {
            ok: true,
            count,
        };
    }),
    'test.subscription': Subscription(Schema.object({
        initial: Schema.number().step(1).min(0).default(0),
    }), (c, { initial }, send) => {
        let count = initial;
        const interval = setInterval(() => {
            count++;
            send({ count });
        }, 1000);
        return () => {
            clearInterval(interval);
        };
    }),
} as const;

export function applyTestApis(ctx: Context) {
    ctx.inject(['api'], ({ api }) => {
        api.provide(TestApis);
    });
}
