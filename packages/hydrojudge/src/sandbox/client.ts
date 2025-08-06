import { EventEmitter } from 'events';
import fs from 'fs';
import superagent from 'superagent';
import WebSocket from 'ws';
import { pipeRequest } from '@hydrooj/utils';
import { version } from '../../package.json';
import { getConfig } from '../config';
import {
    Input, Output, Resize, SandboxRequest, SandboxResult, SandboxVersion,
} from './interface';

let url: string;
const UA = `HydroJudge/${version} (${Math.random().toString(36).substring(2, 8)})`;

export class Stream extends EventEmitter {
    private ws: WebSocket;

    constructor(httpUrl: string, req: SandboxRequest) {
        super();
        const wsUrl = `${httpUrl.replace('http', 'ws')}/stream`;
        this.ws = new WebSocket(wsUrl, { headers: { 'User-Agent': UA } });
        this.ws.onmessage = (e) => {
            const data: Buffer = e.data as Buffer;
            switch (data[0]) {
                case 1:
                    this.emit('end', JSON.parse(data.toString('utf-8', 1)));
                    break;
                case 2:
                    this.emit('output', {
                        index: (data[1] >> 4) & 0xF,
                        fd: (data[1]) & 0xF,
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

function _call(method: 'post' | 'get' | 'delete', endpoint: string, trace?: string) {
    return superagent[method](`${url}/${endpoint}`).set('User-Agent', trace ? `${UA} (${trace})` : UA);
}
const client = new Proxy({
    async run(req: SandboxRequest, trace?: string): Promise<SandboxResult[]> {
        const res = await _call('post', 'run', trace).send(req);
        return res.body;
    },
    async getFile(fileId: string, dest?: string): Promise<Buffer> {
        const req = _call('get', `file/${fileId}`);
        if (dest) {
            const w = fs.createWriteStream(dest);
            return await pipeRequest(req, w, 60000, fileId) as any;
        }
        const res = await req.responseType('arraybuffer');
        return res.body;
    },
    async deleteFile(fileId: string): Promise<void> {
        const res = await _call('delete', `file/${fileId}`);
        return res.body;
    },
    async listFiles(): Promise<Record<string, string>> {
        const res = await _call('get', 'file');
        return res.body;
    },
    async version(): Promise<SandboxVersion> {
        const res = await _call('get', 'version');
        return res.body;
    },
    async config(): Promise<Record<string, any>> {
        const res = await _call('get', 'config');
        return res.body;
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
