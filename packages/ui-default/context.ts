/* eslint-disable ts/no-unsafe-declaration-merging */

import * as cordis from 'cordis';
import type { EventMap } from './api';

export interface Events<C extends Context = Context> extends cordis.Events<C>, EventMap { }

export type { Disposable, FiberState, Plugin } from 'cordis';

export interface Context {
  [Context.events]: Events<this>;
  broadcast: Context['emit'];
}

export class Context extends cordis.Context { }
export type Fiber = cordis.Fiber<Context>;

export class Service<C extends Context = Context> extends cordis.Service<C> {
}
export const ctx = new Context();
