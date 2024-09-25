import { IncomingMessage } from 'http';
import KoaRouter from 'koa-router';
import { pathToRegexp } from 'path-to-regexp';
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

    constructor(path: Parameters<typeof pathToRegexp>[0], public callback?: WebSocketCallback) {
        this.regexp = pathToRegexp(path).regexp;
    }

    accept(socket: WebSocket, request: IncomingMessage, ctx: KoaContext) {
        if (!this.regexp.test(new URL(request.url, `http://${request.headers.host}`).pathname)) return false;
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
