import type { ConnectionHandler, Handler } from './server';

type HandlerEvents =
    Record<`handler/${HookType}/${string}`, (thisArg: Handler & Record<string, any>) => VoidReturn>
    & Record<`handler/${HookType}`, (thisArg: Handler) => VoidReturn>
    & Record<`handler/register/${string}`, (HandlerClass: typeof Handler) => VoidReturn>
    & Record<`connection/${'create' | 'active' | 'close'}`, (thisArg: ConnectionHandler) => VoidReturn>;

export type VoidReturn = Promise<any> | any;
export type HookType = 'before-prepare' | 'before' | 'before-operation' | 'after' | 'finish';

export interface ServerEvents extends HandlerEvents {
    'handler/create': (thisArg: Handler) => VoidReturn
    'handler/init': (thisArg: Handler) => VoidReturn
    'handler/error': (thisArg: Handler, e: Error) => VoidReturn
}
