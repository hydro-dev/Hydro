import axios, { AxiosInstance } from 'axios';
import { SandboxRequest, SandboxResult, SandboxVersion } from './sandbox_interface';

export class SandboxClient {
    private client: AxiosInstance;

    constructor(baseURL: string) {
        this.client = axios.create({
            baseURL,
        });
    }

    public async run(req: SandboxRequest): Promise<SandboxResult[]> {
        return this.client.post('/run', req).then((res) => res.data);
    }

    public async getFile(fileId: string): Promise<Buffer> {
        return this.client.get(`/file/${fileId}`).then((res) => res.data);
    }

    public async deleteFile(fileId: string): Promise<never> {
        return this.client.delete(`/file/${fileId}`);
    }

    public async listFiles(): Promise<Record<string, string>> {
        return this.client.get('/file').then((res) => res.data);
    }

    public async version(): Promise<SandboxVersion> {
        return this.client.get('/version').then((res) => res.data);
    }
}
