/* eslint-disable ts/no-unsafe-declaration-merging */
import LoggerService from '@cordisjs/plugin-logger';
import { TimerService } from '@cordisjs/plugin-timer';
import * as cordis from 'cordis';
import Schema from 'schemastery';
import type { DomainDoc, GeoIP, ModuleInterfaces } from './interface';
import { inject } from './lib/ui';
import { Loader } from './loader';
import type { EventMap } from './service/bus';
import type CheckService from './service/check';
import type { } from './service/migration';

export { EventMap as Events };

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

export type Fiber = cordis.Fiber<Context>;
export const Fiber = cordis.Fiber;

export { Disposable, FiberState, Plugin } from 'cordis';

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

export abstract class Service<T = never> extends cordis.Service<T, Context> {
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
        this.plugin(LoggerService, {
            console: {
                showDiff: false,
                showTime: 'dd hh:mm:ss',
                label: {
                    align: 'right',
                    width: 9,
                    margin: 1,
                },
                levels: { default: process.env.DEV ? 3 : 2 },
            },
        });
    }
}
