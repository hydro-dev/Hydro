import type { Context } from 'cordis';
import type { ApiHandler } from './api';
import type { ConnectionHandler, Handler, NotFoundHandler } from './server';

export interface KnownHandlers {
    NotFound: NotFoundHandler;
}

type MapHandlerEvents<N extends string, H extends Handler<any>> =
    Record<`handler/${HookType}/${N}`, (thisArg: H) => VoidReturn>
    & Record<`handler/${HookWithMethod}/${N}/${Methods}`, (thisArg: H) => VoidReturn>;

type KnownHandlerEvents = {
    [key in keyof KnownHandlers]: MapHandlerEvents<key, KnownHandlers[key]>
}[keyof KnownHandlers];

type HandlerEvents<C> =
    Record<`handler/${HookType}`, (thisArg: Handler<C>) => VoidReturn>
    & Record<`connection/${'create' | 'active' | 'close'}`, (thisArg: any) => VoidReturn>;

export type VoidReturn = Promise<any> | any;
export type HookType = 'before-prepare' | 'before' | 'before-operation' | 'after' | 'finish';
export type Methods = 'get' | 'post' | 'put' | 'delete' | 'patch';
export type HookWithMethod = Exclude<HookType, 'before-operation'>;

export interface ServerEvents<C extends Context> extends KnownHandlerEvents, HandlerEvents<C> {
    'handler/create': (thisArg: Handler<C> | ConnectionHandler<C>, type: 'ws' | 'http') => VoidReturn;
    'handler/create/http': (thisArg: Handler<C>) => VoidReturn;
    'handler/create/ws': (thisArg: ConnectionHandler<C>) => VoidReturn;
    'handler/init': (thisArg: Handler<C>) => VoidReturn;
    'handler/error': (thisArg: Handler<C> | ConnectionHandler<C>, e: Error) => VoidReturn;
    'handler/api/before': (thisArg: ApiHandler<C>) => VoidReturn;
    'api/before': (args: any) => VoidReturn;
    [k: `handler/${HookType}/${string}`]: (thisArg: any) => VoidReturn;
    [k: `handler/${HookWithMethod}/${string}/${Methods}`]: (thisArg: any) => VoidReturn;
    [k: `handler/register/${string}`]: (HandlerClass: new (...args: any[]) => any) => VoidReturn;
    [k: `handler/error/${string}`]: (thisArg: Handler<C>, e: Error) => VoidReturn;
    [k: `handler/api/before/${string}`]: (thisArg: ApiHandler<C>) => VoidReturn;
    [k: `api/before/${string}`]: (args: any) => VoidReturn;
}

declare module 'cordis' {
    interface Events<C> extends ServerEvents<C> {
    }
}
