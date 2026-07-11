import { Context } from 'cordis';
import type { EventMap } from './api';

declare module 'cordis' {
  export interface Events extends EventMap { }
}

export type { Disposable, Plugin } from 'cordis';
export { Context, Fiber, FiberState, Service } from 'cordis';

export const ctx = new Context();
