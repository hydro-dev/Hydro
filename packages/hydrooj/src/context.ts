import * as cordis from 'cordis';
import Schema from 'schemastery';
import { inject } from './lib/ui';
import { Loader, ModuleInterfaces } from './loader';
import { EventMap } from './service/bus';

export interface Events<C extends Context = Context> extends cordis.Events<C>, EventMap {
}

function addScript<K>(name: string, description: string, validate: Schema<K>, run: (args: K, report: any) => boolean | Promise<boolean>) {
    if (global.Hydro.script[name]) throw new Error(`duplicate script ${name} registered.`);
    global.Hydro.script[name] = { description, validate, run };
    return () => delete global.Hydro.script[name];
}

function provideModule<T extends keyof ModuleInterfaces>(type: T, id: string, module: ModuleInterfaces[T]) {
    if (global.Hydro.module[type][id]) throw new Error(`duplicate script ${type}/${id} registered.`);
    global.Hydro.module[type as any][id] = module;
    return () => delete global.Hydro.module[type][id];
}

export interface Context {
    [Context.events]: Events<this>;
    loader: Loader;
    Route: typeof import('./service/server').Route;
    Connection: typeof import('./service/server').Connection;
    setTimeout: typeof setTimeout;
    setInterval: typeof setInterval;
    setImmediate: typeof setImmediate;
    addScript: typeof addScript;
    provideModule: typeof provideModule;
    inject: typeof inject;
    api: ApiMixin;
    broadcast: Context['emit'];
}

export class Context extends cordis.Context {
    static readonly session = Symbol('session');
}

export namespace Context {
    export interface Config extends cordis.Context.Config { }
}

export type Runtime = cordis.Runtime<Context>;
export type State = cordis.State<Context>;
export type Fork = cordis.Fork<Context>;
export type Plugin = cordis.Plugin<Context>;
export const Service = cordis.Service<Context>;
export namespace Plugin {
    export type Function<T = any> = cordis.Plugin.Function<T, Context>;
    export type Constructor<T = any> = cordis.Plugin.Constructor<T, Context>;
    export type Object<S = any, T = any> = cordis.Plugin.Object<S, T, Context>;
}

const T = <F extends (...args: any[]) => any>(origFunc: F, disposeFunc?) =>
    function method(this: cordis.Service, ...args: Parameters<F>) {
        const res = origFunc(...args);
        this.caller?.on('dispose', () => (disposeFunc ? disposeFunc(res) : res()));
    };
export class ApiMixin extends Service {
    static readonly methods = ['addScript', 'setInterval', 'setTimeout', 'setImmediate', 'provideModule', 'inject', 'broadcast'];
    addScript = T(addScript);
    setInterval = T(setInterval, clearInterval);
    setTimeout = T(setTimeout, clearTimeout);
    setImmediate = T(setImmediate, clearImmediate);
    provideModule = T(provideModule);
    inject = T(inject);
    broadcast = (event: string, ...payload) => this.ctx.emit('bus/broadcast', event, payload);
    constructor(ctx) {
        super(ctx, 'api', true);
    }
}
Context.service('api', ApiMixin);
