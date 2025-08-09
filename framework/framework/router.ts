import { IncomingMessage } from 'http';
import KoaRouter from '@koa/router';
import { Keys, pathToRegexp } from 'path-to-regexp';
import type WebSocket from 'ws';
import type { KoaContext } from './server';

type WebSocketCallback = (socket: WebSocket, request: IncomingMessage, ctx: KoaContext) => void;
function remove<T>(list: T[], item: T) {
    const index = list.indexOf(item);
    if (index >= 0) list.splice(index, 1);
}

export class WebSocketLayer {
    clients = new Set<WebSocket>();
    regexp: RegExp;
    keys: Keys;

    constructor(path: Parameters<typeof pathToRegexp>[0], public callback?: WebSocketCallback) {
        const r = pathToRegexp(path);
        this.regexp = r.regexp;
        this.keys = r.keys;
    }

    accept(socket: WebSocket, request: IncomingMessage, ctx: KoaContext) {
        const match = this.regexp.exec(new URL(request.url, `http://${request.headers.host}`).pathname);
        if (!match) return false;
        ctx.params ||= {};
        for (let i = 0; i < this.keys.length; i++) {
            ctx.params[this.keys[i].name] = match[i + 1];
            ctx.HydroContext.args[this.keys[i].name] = match[i + 1];
        }
        this.clients.add(socket);
        socket.on('close', () => {
            this.clients.delete(socket);
        });
        this.callback?.(socket, request, ctx);
        return true;
    }

    close() {
        for (const socket of this.clients) {
            socket.close();
        }
    }
}

export class Router extends KoaRouter {
    wsStack: WebSocketLayer[] = [];
    disposeLastOp = () => null;

    /**
     * hack into router methods to make sure that koa middlewares are disposable
     */
    register(...args: Parameters<KoaRouter['register']>) {
        const layer = super.register(...args);
        this.disposeLastOp = () => remove(this.stack, layer);
        return layer;
    }

    ws(path: Parameters<typeof pathToRegexp>[0], callback?: WebSocketCallback) {
        const layer = new WebSocketLayer(path, callback);
        this.wsStack.push(layer);
        this.disposeLastOp = () => {
            layer.close();
            remove(this.wsStack, layer);
        };
        return layer;
    }
}
