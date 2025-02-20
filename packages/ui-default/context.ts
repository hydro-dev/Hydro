import * as cordis from '@cordisjs/core';
import type { EventMap } from './api';

export interface Events<C extends Context = Context> extends cordis.Events<C>, EventMap { }

export type { Disposable, ScopeStatus, Plugin } from '@cordisjs/core';

export interface Context {
  [Context.events]: Events<this>;
  broadcast: Context['emit'];
}

export class Context extends cordis.Context { }
export type EffectScope = cordis.EffectScope<Context>;

export class Service<C extends Context = Context> extends cordis.Service<C> {
}
export const ctx = new Context();
