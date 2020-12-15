import { Readable } from 'stream';
import Minio, { BucketItem, ItemBucketMetadata } from 'minio';

interface StorageOptions {
    host?: string,
    port?: number,
    useSSL?: boolean,
    accessKey?: string,
    secretKey?: string,
    bucket?: string,
    region?: string,
}

const defaultConfig: StorageOptions = {
    host: 'play.min.io',
    port: 9000,
    useSSL: true,
    accessKey: 'Q3AM3UQ867SPQQA43P2F',
    secretKey: 'zuf+tfteSlswRu7BJ86wekitnifILbZam1KYY3TG',
    bucket: 'hydro',
    region: 'us-east-1',
};

class StorageService {
    public client: Minio.Client;
    private opts: StorageOptions;

    async start(opts: StorageOptions) {
        this.opts = { ...defaultConfig, ...opts };
        this.client = new Minio.Client({
            endPoint: this.opts.host,
            port: this.opts.port,
            useSSL: this.opts.useSSL,
            accessKey: this.opts.accessKey,
            secretKey: this.opts.secretKey,
        });
        const exists = await this.client.bucketExists(this.opts.bucket);
        if (!exists) await this.client.makeBucket(this.opts.bucket, this.opts.region);
    }

    async put(target: string, file: string | Buffer | Readable, meta: ItemBucketMetadata = {}) {
        if (typeof file === 'string') return await this.client.fPutObject(this.opts.bucket, target, file, meta);
        return await this.client.putObject(this.opts.bucket, target, file, meta);
    }

    async get(target: string) {
        return await this.client.getObject(this.opts.bucket, target);
    }

    async del(target: string | string[]) {
        if (typeof target === 'string') return await this.client.removeObject(this.opts.bucket, target);
        return await this.client.removeObjects(this.opts.bucket, target);
    }

    async list(target: string, recursive = false) {
        const stream = this.client.listObjects(this.opts.bucket, target, recursive);
        return await new Promise<BucketItem[]>((resolve, reject) => {
            const results: BucketItem[] = [];
            stream.on('data', (result) => results.push(result));
            stream.on('end', () => resolve(results));
            stream.on('error', reject);
        });
    }
}

const service = new StorageService();
global.Hydro.service.storage = service;
export = service;
