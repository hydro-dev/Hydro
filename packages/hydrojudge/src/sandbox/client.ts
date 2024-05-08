import { EventEmitter } from 'events';
import fs from 'fs';
import superagent from 'superagent';
import WebSocket from 'ws';
import { pipeRequest } from '@hydrooj/utils';
import { getConfig } from '../config';
import {
    Input, Output, Resize, SandboxRequest, SandboxResult, SandboxVersion,
} from './interface';

let url;

export class Stream extends EventEmitter {
    private ws: WebSocket;

    constructor(httpUrl: string, req: SandboxRequest) {
        super();
        const wsUrl = `${httpUrl.replace('http', 'ws')}/stream`;
        this.ws = new WebSocket(wsUrl);
        this.ws.onmessage = (e) => {
            const data: Buffer = e.data as Buffer;
            switch (data[0]) {
                case 1:
                    this.emit('end', JSON.parse(data.toString('utf-8', 1)));
                    break;
                case 2:
                    this.emit('output', {
                        index: (data[1] >> 4) & 0xf,
                        fd: (data[1]) & 0xf,
                        content: data.subarray(2),
                    });
                    break;
                default:
                    break;
            }
        };
        this.ws.onclose = (e) => {
            this.emit('close', e);
        };
        this.ws.onopen = (e) => {
            this.request(req);
            this.emit('open', e);
        };
        this.ws.onerror = (e) => {
            this.emit('error', e);
        };
    }

    on(type: 'open', handle: (e: WebSocket.Event) => void): this;
    on(type: 'close', handle: (e: WebSocket.CloseEvent) => void): this;
    on(type: 'error', handle: (e: WebSocket.ErrorEvent) => void): this;
    on(type: 'output', handle: (v: Output) => void): this;
    on(type: 'end', handle: (v: SandboxResult[]) => void): this;
    on(type: 'open' | 'close' | 'error' | 'output' | 'end', handle: (v: any) => void): this {
        super.on(type, handle);
        return this;
    }

    private request(r: SandboxRequest) {
        this.ws.send(Buffer.concat([Buffer.of(1), Buffer.from(JSON.stringify(r))]));
    }

    resize(r: Resize) {
        this.ws.send(Buffer.concat([Buffer.of(2), Buffer.from(JSON.stringify(r))]));
    }

    input(i: Input) {
        this.ws.send(Buffer.concat([Buffer.of(3, (i.index << 4) | i.fd), i.content]));
    }

    cancel() {
        this.ws.send(Buffer.of(4));
    }

    close() {
        this.ws.close();
    }

    terminate() {
        this.ws.terminate();
    }
}

const client = new Proxy({
    run(req: SandboxRequest): Promise<SandboxResult[]> {
        return superagent.post(`${url}/run`).send(req).then((res) => res.body);
    },
    getFile(fileId: string, dest?: string): Promise<Buffer> {
        if (dest) {
            const w = fs.createWriteStream(dest);
            return pipeRequest(superagent.get(`${url}/file/${fileId}`), w, 60000, fileId) as any;
        }
        return superagent.get(`${url}/file/${fileId}`).responseType('arraybuffer').then((res) => res.body);
    },
    deleteFile(fileId: string): Promise<void> {
        return superagent.delete(`${url}/file/${fileId}`).then((res) => res.body);
    },
    listFiles(): Promise<Record<string, string>> {
        return superagent.get(`${url}/file`).then((res) => res.body);
    },
    version(): Promise<SandboxVersion> {
        return superagent.get(`${url}/version`).then((res) => res.body);
    },
    config(): Promise<Record<string, any>> {
        return superagent.get(`${url}/config`).then((res) => res.body);
    },
    stream(req: SandboxRequest): Stream {
        return new Stream(url, req);
    },
}, {
    get(self, key) {
        url = getConfig('sandbox_host');
        if (url.endsWith('/')) url = url.substring(0, url.length - 1);
        return self[key];
    },
});

export default client;
