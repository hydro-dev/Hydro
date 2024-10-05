import * as cordis from 'cordis';
import Schema from 'schemastery';
import type { ServerEvents, WebService } from '@hydrooj/framework';
import type { DomainDoc, GeoIP, ModuleInterfaces } from './interface';
import { inject } from './lib/ui';
import { Loader } from './loader';
import type { EventMap } from './service/bus';
import type { CheckService } from './service/check';
import type { } from './service/migration';
import type { ConnectionHandler, Handler } from './service/server';

export interface Events<C extends Context = Context> extends cordis.Events<C>, EventMap, ServerEvents<Handler, ConnectionHandler> { }

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

export type EffectScope = cordis.EffectScope<Context>;
export type ForkScope = cordis.ForkScope<Context>;
export type MainScope = cordis.MainScope<Context>;

export type { Disposable, ScopeStatus, Plugin } from 'cordis';

export interface Context extends cordis.Context, Pick<WebService, 'Route' | 'Connection' | 'withHandlerClass'> {
    // @ts-ignore
    [Context.events]: Events<this>;
    loader: Loader;
    check: CheckService;
    setImmediate: typeof setImmediate;
    addScript: typeof addScript;
    provideModule: typeof provideModule;
    injectUI: typeof inject;
    broadcast: Context['emit'];
    geoip?: GeoIP;
}

export abstract class Service<T = any, C extends Context = Context> extends cordis.Service<T, C> {
    [cordis.Service.setup]() {
        this.ctx = new Context() as C;
    }
}

const T = <F extends (...args: any[]) => any>(origFunc: F, disposeFunc?) =>
    function method(this: cordis.Service, ...args: Parameters<F>) {
        this.ctx.effect(() => {
            const res = origFunc(...args);
            return () => (disposeFunc ? disposeFunc(res) : res());
        });
    };

export class ApiMixin extends Service {
    addScript = T(addScript);
    setImmediate = T(setImmediate, clearImmediate);
    provideModule = T(provideModule);
    injectUI = T(inject);
    broadcast = (event: keyof EventMap, ...payload) => this.ctx.emit('bus/broadcast', event, payload);
    constructor(ctx) {
        super(ctx, '$api', true);
        ctx.mixin('$api', ['addScript', 'setImmediate', 'provideModule', 'injectUI', 'broadcast']);
    }
}

export class Context extends cordis.Context {
    domain?: DomainDoc;

    constructor(config: {} = {}) {
        super(config);
        this.plugin(ApiMixin);
    }
}

const old = cordis.Registry.prototype.inject;
// cordis.Registry.prototype.using = old;
cordis.Registry.prototype.inject = function wrapper(...args) {
    if (typeof args[0] === 'string') {
        console.warn('old functionality of ctx.inject is deprecated. please use ctx.injectUI instead.');
        return T(inject).call(this, ...args as any) as any;
    }
    return old.call(this, ...args);
};
