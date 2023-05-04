import superagent from 'superagent';
import { getConfig } from '../config';
import { SandboxRequest, SandboxResult, SandboxVersion } from './interface';

let url;

const client = new Proxy({
    run(req: SandboxRequest): Promise<SandboxResult[]> {
        return superagent.post(`${url}/run`).send(req).then((res) => res.body);
    },
    getFile(fileId: string): Promise<Buffer> {
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
}, {
    get(self, key) {
        url = getConfig('sandbox_host');
        if (url.endsWith('/')) url = url.substring(0, url.length - 1);
        return self[key];
    },
});

export default client;
