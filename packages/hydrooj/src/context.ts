import type { } from '@cordisjs/plugin-logger';
import type { } from '@cordisjs/plugin-timer';
import { Service } from 'cordis';
import Schema from 'schemastery';
import type { DomainDoc, GeoIP, ModuleInterfaces } from './interface';
import { inject } from './lib/ui';
import { Loader } from './loader';
import type { EventMap } from './service/bus';
import type CheckService from './service/check';
import type { } from './service/migration';

export { EventMap as Events };

declare module 'cordis' {
    export interface Events extends EventMap { }
    interface Context {
        domain?: DomainDoc;
        loader: Loader;
        check: CheckService;
        setImmediate: typeof setImmediate;
        addScript: typeof addScript;
        provideModule: typeof provideModule;
        injectUI: typeof inject;
        broadcast: Context['emit'];
        geoip?: GeoIP;
    }
}

function addScript<K>(name: string, description: string, validate: Schema<K>, run: (args: K, report: any) => boolean | Promise<boolean>) {
    if (global.Hydro.script[name]) throw new Error(`duplicate script ${name} registered.`);
    global.Hydro.script[name] = { description, validate, run };
    return () => delete global.Hydro.script[name];
}

function provideModule<T extends keyof ModuleInterfaces>(type: T, id: string, module: ModuleInterfaces[T]) {
    if (global.Hydro.module[type][id]) throw new Error(`duplicate module ${type}/${id} registered.`);
    global.Hydro.module[type as any][id] = module;
    return () => delete global.Hydro.module[type][id];
}

export { Context, Disposable, Fiber, FiberState, Plugin, Service } from 'cordis';

const T = <F extends (...args: any[]) => any>(origFunc: F, disposeFunc?) =>
    function method(this: Service, ...args: Parameters<F>) {
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
    broadcast = (event: keyof EventMap, ...payload) =>
        this.ctx.emit('bus/broadcast', event, payload, process.env.TRACE_BROADCAST ? new Error().stack : null);

    constructor(ctx) {
        super(ctx, '$api');
        ctx.mixin('$api', ['addScript', 'setImmediate', 'provideModule', 'injectUI', 'broadcast']);
    }
}
