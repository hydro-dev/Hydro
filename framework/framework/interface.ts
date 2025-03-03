import type { ConnectionHandler, Handler } from './server';
import type { Context as CordisContext } from '@cordisjs/core';

type HandlerEvents<C extends CordisContext> =
    Record<`handler/${HookType}/${string}`, (thisArg: Handler<C> & Record<string, any>) => VoidReturn>
    & Record<`handler/${HookType}`, (thisArg: Handler<C>) => VoidReturn>
    & Record<`handler/register/${string}`, (HandlerClass: new (...args: any[]) => Handler<C>) => VoidReturn>
    & Record<`connection/${'create' | 'active' | 'close'}`, (thisArg: ConnectionHandler<C>) => VoidReturn>;

export type VoidReturn = Promise<any> | any;
export type HookType = 'before-prepare' | 'before' | 'before-operation' | 'after' | 'finish';

export interface ServerEvents<C extends CordisContext> extends HandlerEvents<C> {
    'handler/create': (thisArg: Handler<C>, type: 'ws' | 'http') => VoidReturn
    'handler/init': (thisArg: Handler<C>) => VoidReturn
    'handler/error': (thisArg: Handler<C>, e: Error) => VoidReturn
}
