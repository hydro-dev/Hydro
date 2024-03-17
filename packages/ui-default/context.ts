import * as cordis from 'cordis';
import type { EventMap } from './api';

export interface Events<C extends Context = Context> extends cordis.Events<C>, EventMap { }

export type { Disposable, ScopeStatus, Plugin } from 'cordis';

export interface Context {
  [Context.events]: Events<this>;
  broadcast: Context['emit'];
}

export class Context extends cordis.Context {
  /** @deprecated use `ctx.root` instead */
  get app() {
    return this.root;
  }

  /** @deprecated use `root.config` instead */
  get options() {
    return this.root.config;
  }
}

export namespace Context {
  export type Associate<P extends string, C extends Context = Context> = cordis.Context.Associate<P, C>;
}

export type MainScope = cordis.MainScope<Context>;
export type EffectScope = cordis.EffectScope<Context>;
export type ForkScope = cordis.ForkScope<Context>;

export abstract class Service<T = any, C extends Context = Context> extends cordis.Service<T, C> {
  [cordis.Service.setup]() {
    this.ctx = new Context() as C;
  }
}
export const ctx = new Context();
