import fs from 'fs';
import superagent from 'superagent';
import { getConfig } from '../config';
import { SandboxRequest, SandboxResult, SandboxVersion } from './interface';

let url;

const client = new Proxy({
    run(req: SandboxRequest): Promise<SandboxResult[]> {
        return superagent.post(`${url}/run`).send(req).then((res) => res.body);
    },
    getFile(fileId: string, dest?: string): Promise<Buffer> {
        if (dest) {
            const w = fs.createWriteStream(dest);
            superagent.get(`${url}/file/${fileId}`).pipe(w);
            return new Promise((resolve, reject) => {
                w.on('finish', () => resolve(null));
                w.on('error', reject);
            });
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
}, {
    get(self, key) {
        url = getConfig('sandbox_host');
        if (url.endsWith('/')) url = url.substring(0, url.length - 1);
        return self[key];
    },
});

export default client;
