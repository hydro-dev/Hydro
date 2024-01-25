import * as cordis from 'cordis';
import type { EventMap } from './api';

export interface Events<C extends Context = Context> extends cordis.Events<C>, EventMap {
}

export interface Context {
  [Context.events]: Events<Context>;
  setTimeout: typeof setTimeout;
  setInterval: typeof setInterval;
  api: ApiMixin;
}

export class Context extends cordis.Context {
  static readonly session = Symbol('session');
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
  static readonly methods = ['setInterval', 'setTimeout'];
  setInterval = T(setInterval, clearInterval);
  setTimeout = T(setTimeout, clearTimeout);
  constructor(ctx) {
    super(ctx, 'api', true);
  }
}
Context.service('api', ApiMixin);
export const ctx = new Context();
