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

export { Disposable, Plugin, ScopeStatus } from 'cordis';

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
    // TODO: move to @cordisjs/plugin-timer
    setTimeout(callback: () => void, delay: number): () => void
    setInterval(callback: () => void, delay: number): () => void
    sleep(delay: number): Promise<void>
    throttle<F extends (...args: any[]) => void>(callback: F, delay: number, noTrailing?: boolean): WithDispose<F>
    debounce<F extends (...args: any[]) => void>(callback: F, delay: number): WithDispose<F>
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

export class ApiMixin extends cordis.Service {
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

type WithDispose<T> = T & { dispose: () => void };

class TimerService extends Service {
    constructor(ctx) {
        super(ctx, '$timer');
        ctx.mixin('$timer', ['setTimeout', 'setInterval', 'sleep', 'throttle', 'debounce']);
    }

    setTimeout(callback: () => void, delay: number) {
        const dispose = this.ctx.effect(() => {
            const timer = setTimeout(() => {
                dispose();
                callback();
            }, delay);
            return () => clearTimeout(timer);
        });
        return dispose;
    }

    setInterval(callback: () => void, delay: number) {
        return this.ctx.effect(() => {
            const timer = setInterval(callback, delay);
            return () => clearInterval(timer);
        });
    }

    sleep(delay: number) {
        const caller = this.ctx;
        return new Promise<void>((resolve, reject) => {
            const dispose1 = this.setTimeout(() => {
                dispose1();
                dispose2(); // eslint-disable-line @typescript-eslint/no-use-before-define
                resolve();
            }, delay);
            const dispose2 = caller.on('dispose', () => {
                dispose1();
                dispose2();
                reject(new Error('Context has been disposed'));
            });
        });
    }

    private createWrapper(callback: (args: any[], check: () => boolean) => any, isDisposed = false) {
        this.ctx.scope.assertActive();

        let timer: number | NodeJS.Timeout | undefined;
        const dispose = () => {
            isDisposed = true;
            remove(); // eslint-disable-line @typescript-eslint/no-use-before-define
            clearTimeout(timer);
        };

        const wrapper: any = (...args: any[]) => {
            clearTimeout(timer);
            timer = callback(args, () => !isDisposed && this.ctx.scope.active);
        };
        wrapper.dispose = dispose;
        const remove = this.ctx.scope.disposables.push(dispose);
        return wrapper;
    }

    throttle<F extends (...args: any[]) => void>(callback: F, delay: number, noTrailing?: boolean): WithDispose<F> {
        let lastCall = -Infinity;
        const execute = (...args: any[]) => {
            lastCall = Date.now();
            callback(...args);
        };
        return this.createWrapper((args, isActive) => { // eslint-disable-line consistent-return
            const now = Date.now();
            const remaining = delay - (now - lastCall);
            if (remaining <= 0) {
                execute(...args);
            } else if (isActive()) {
                return setTimeout(execute, remaining, ...args);
            }
        }, noTrailing);
    }

    debounce<F extends (...args: any[]) => void>(callback: F, delay: number): WithDispose<F> {
        return this.createWrapper((args, isActive) => {
            if (!isActive()) return;
            return setTimeout(callback, delay, ...args); // eslint-disable-line consistent-return
        });
    }
}

export class Context extends cordis.Context {
    domain?: DomainDoc;

    constructor() {
        super();
        this.plugin(ApiMixin);
        this.plugin(TimerService);
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
