import * as cordis from '@cordisjs/core';
import LoggerService from '@cordisjs/logger';
import { TimerService } from '@cordisjs/plugin-timer';
import Schema from 'schemastery';
import type { DomainDoc, GeoIP, ModuleInterfaces } from './interface';
import { inject } from './lib/ui';
import { Loader } from './loader';
import type { EventMap } from './service/bus';
import type { CheckService } from './service/check';
import type { } from './service/migration';

// TODO: this is an broken declaration
export { EventMap as Events };

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

export { Disposable, Plugin, ScopeStatus } from '@cordisjs/core';

export interface Context extends cordis.Context {
    [Context.events]: EventMap & cordis.Events<Context>;
    loader: Loader;
    check: CheckService;
    setImmediate: typeof setImmediate;
    addScript: typeof addScript;
    provideModule: typeof provideModule;
    injectUI: typeof inject;
    broadcast: Context['emit'];
    geoip?: GeoIP;
}

export abstract class Service extends cordis.Service<Context> {
}

const T = <F extends (...args: any[]) => any>(origFunc: F, disposeFunc?) =>
    function method(this: cordis.Service, ...args: Parameters<F>) {
        this.ctx.effect(() => {
            const res = origFunc(...args);
            return () => (disposeFunc ? disposeFunc(res) : res());
        });
    };

export class ApiMixin extends cordis.Service<Context> {
    addScript = T(addScript);
    setImmediate = T(setImmediate, clearImmediate);
    provideModule = T(provideModule);
    injectUI = T(inject);
    broadcast = (event: keyof EventMap, ...payload) =>
        this.ctx.emit('bus/broadcast', event, payload, process.env.TRACE_BROADCAST ? new Error().stack : null);

    constructor(ctx) {
        super(ctx, '$api');
        ctx.mixin('$api', ['addScript', 'setImmediate', 'provideModule', 'injectUI', 'broadcast']);
    }
}

export class Context extends cordis.Context {
    domain?: DomainDoc;

    constructor() {
        super();
        this.plugin(ApiMixin);
        this.plugin(TimerService);
        this.plugin(LoggerService);
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
