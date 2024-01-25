import * as cordis from 'cordis';
import Schema from 'schemastery';
import type { DomainDoc, GeoIP, ModuleInterfaces } from './interface';
import { inject } from './lib/ui';
import { Loader } from './loader';
import { EventMap } from './service/bus';
import type { CheckService } from './service/check';

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
    [Context.events]: Events<Context>;
    loader: Loader;
    Route: typeof import('./service/server').Route;
    Connection: typeof import('./service/server').Connection;
    withHandlerClass: import('./service/server').RouteService['withHandlerClass'];
    check: CheckService;
    setTimeout: typeof setTimeout;
    setInterval: typeof setInterval;
    setImmediate: typeof setImmediate;
    addScript: typeof addScript;
    provideModule: typeof provideModule;
    /** @deprecated use injectUI instead */
    inject: typeof inject;
    injectUI: typeof inject;
    api: ApiMixin;
    broadcast: Context['emit'];
    geoip?: GeoIP;
}

export class Context extends cordis.Context {
    domain?: DomainDoc;
}

export namespace Context {
    export interface Config extends cordis.Context.Config { }
}

export type MainScope = cordis.MainScope<Context>;
export type EffectScope = cordis.EffectScope<Context>;
export type ForkScope = cordis.ForkScope<Context>;
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
    static readonly methods = ['addScript', 'setInterval', 'setTimeout', 'setImmediate', 'provideModule', 'inject', 'injectUI', 'broadcast'];
    addScript = T(addScript);
    setInterval = T(setInterval, clearInterval);
    setTimeout = T(setTimeout, clearTimeout);
    setImmediate = T(setImmediate, clearImmediate);
    provideModule = T(provideModule);
    inject = T(inject);
    injectUI = T(inject);
    broadcast = (event: keyof EventMap, ...payload) => this.ctx.emit('bus/broadcast', event, payload);
    constructor(ctx) {
        super(ctx, 'api', true);
    }
}
Context.service('api', ApiMixin);
