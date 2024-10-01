import type { ConnectionHandler, Handler } from './server';

type HandlerEvents<T extends Handler, C extends ConnectionHandler> =
    Record<`handler/${HookType}/${string}`, (thisArg: T & Record<string, any>) => VoidReturn>
    & Record<`handler/${HookType}`, (thisArg: T) => VoidReturn>
    & Record<`handler/register/${string}`, (HandlerClass: new (...args: any[]) => T) => VoidReturn>
    & Record<`connection/${'create' | 'active' | 'close'}`, (thisArg: C) => VoidReturn>;

export type VoidReturn = Promise<any> | any;
export type HookType = 'before-prepare' | 'before' | 'before-operation' | 'after' | 'finish';

export interface ServerEvents<T extends Handler = Handler, C extends ConnectionHandler = ConnectionHandler> extends HandlerEvents<T, C> {
    'handler/create': (thisArg: Handler, type: 'ws' | 'http') => VoidReturn
    'handler/init': (thisArg: Handler) => VoidReturn
    'handler/error': (thisArg: Handler, e: Error) => VoidReturn
}
