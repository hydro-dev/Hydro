import axios, { AxiosInstance } from 'axios';
import { SandboxRequest, SandboxResult, SandboxVersion } from './interface';

export class SandboxClient {
    private client: AxiosInstance;

    constructor(baseURL: string) {
        this.client = axios.create({ baseURL });
    }

    public run(req: SandboxRequest): Promise<SandboxResult[]> {
        return this.client.post('/run', req).then((res) => res.data);
    }

    public getFile(fileId: string): Promise<Buffer> {
        return this.client.get(`/file/${fileId}`).then((res) => res.data);
    }

    public deleteFile(fileId: string): Promise<never> {
        return this.client.delete(`/file/${fileId}`);
    }

    public listFiles(): Promise<Record<string, string>> {
        return this.client.get('/file').then((res) => res.data);
    }

    public version(): Promise<SandboxVersion> {
        return this.client.get('/version').then((res) => res.data);
    }
}
