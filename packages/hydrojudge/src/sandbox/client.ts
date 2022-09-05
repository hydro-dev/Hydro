import superagent from 'superagent';
import { getConfig } from '../config';
import { SandboxRequest, SandboxResult, SandboxVersion } from './interface';

class SandboxClient {
    constructor(public baseURL: string) {
        if (baseURL.endsWith('/')) this.baseURL = baseURL.substring(0, baseURL.length - 1);
    }

    public run(req: SandboxRequest): Promise<SandboxResult[]> {
        return superagent.post(`${this.baseURL}/run`).send(req).then((res) => res.body);
    }

    public getFile(fileId: string): Promise<Buffer> {
        return superagent.get(`${this.baseURL}/file/${fileId}`).then((res) => res.body);
    }

    public deleteFile(fileId: string): Promise<void> {
        return superagent.delete(`${this.baseURL}/file/${fileId}`).then((res) => res.body);
    }

    public listFiles(): Promise<Record<string, string>> {
        return superagent.get(`${this.baseURL}/file`).then((res) => res.body);
    }

    public version(): Promise<SandboxVersion> {
        return superagent.get(`${this.baseURL}/version`).then((res) => res.body);
    }
}

const client = new Proxy({} as SandboxClient, {
    get(self, key) {
        let url = getConfig('sandbox_host');
        if (url.endsWith('/')) url = url.substring(0, url.length - 1);
        const c = new SandboxClient(url);
        return c[key].bind(c);
    },
});

export default client;
