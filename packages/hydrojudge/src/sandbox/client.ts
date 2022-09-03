import superagent from 'superagent';
import { SandboxRequest, SandboxResult, SandboxVersion } from './interface';

export class SandboxClient {
    constructor(public baseURL: string) {
        if (baseURL.endsWith('/')) baseURL = baseURL.substring(0, baseURL.length - 1);
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
