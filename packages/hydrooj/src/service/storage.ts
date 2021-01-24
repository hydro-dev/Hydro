import { Readable } from 'stream';
import assert from 'assert';
import { URL } from 'url';
import { Client, BucketItem, ItemBucketMetadata } from 'minio';
import { createReadStream } from 'fs-extra';
import { Logger } from '../logger';
import { streamToBuffer } from '../utils';
import * as system from '../model/system';

const logger = new Logger('storage');

interface StorageOptions {
    endPoint: string;
    accessKey: string;
    secretKey: string;
    bucket: string;
    region?: string;
    endPointForUser?: string;
    endPointForJudge?: string;
}

interface MinioEndpointConfig {
    endPoint: string;
    port: number;
    useSSL: boolean;
}

function parseMainEndpointUrl(endpoint: string): MinioEndpointConfig {
    const url = new URL(endpoint);
    const result: Partial<MinioEndpointConfig> = {};
    if (url.pathname !== '/') throw new Error('Main MinIO endpoint URL of a sub-directory is not supported.');
    if (url.username || url.password || url.hash || url.search) {
        throw new Error('Authorization, search parameters and hash are not supported for main MinIO endpoint URL.');
    }
    if (url.protocol === 'http:') result.useSSL = false;
    else if (url.protocol === 'https:') result.useSSL = true;
    else {
        throw new Error(
            `Invalid protocol "${url.protocol}" for main MinIO endpoint URL. Only HTTP and HTTPS are supported.`,
        );
    }
    result.endPoint = url.hostname;
    result.port = url.port ? Number(url.port) : result.useSSL ? 443 : 80;
    return result as MinioEndpointConfig;
}
function parseAlternativeEndpointUrl(endpoint: string): (originalUrl: string) => string {
    if (!endpoint) return (originalUrl) => originalUrl;
    const pathonly = endpoint.startsWith('/');
    if (pathonly) endpoint = `https://localhost${endpoint}`;
    const url = new URL(endpoint);
    if (url.hash || url.search) throw new Error('Search parameters and hash are not supported for alternative MinIO endpoint URL.');
    if (!url.pathname.endsWith('/')) throw new Error("Alternative MinIO endpoint URL's pathname must ends with '/'.");
    return (originalUrl) => {
        const parsedOriginUrl = new URL(originalUrl);
        const replaced = new URL(parsedOriginUrl.pathname.slice(1) + parsedOriginUrl.search + parsedOriginUrl.hash, url).toString();
        return pathonly
            ? replaced.replace('https://localhost', '')
            : replaced;
    };
}
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent
function encodeRFC5987ValueChars(str: string) {
    return (
        encodeURIComponent(str)
            // Note that although RFC3986 reserves "!", RFC5987 does not,
            // so we do not need to escape it
            .replace(/['()]/g, escape) // i.e., %27 %28 %29
            .replace(/\*/g, '%2A')
            // The following are not required for percent-encoding per RFC5987,
            // so we can allow for a little better readability over the wire: |`^
            .replace(/%(?:7C|60|5E)/g, unescape)
    );
}

class StorageService {
    public client: Client;
    public error = '';
    private opts: StorageOptions;
    private replaceWithAlternativeUrlFor: Record<'user' | 'judge', (originalUrl: string) => string>;

    async start(opts: StorageOptions) {
        try {
            this.opts = opts;
            this.client = new Client({
                ...parseMainEndpointUrl(this.opts.endPoint),
                accessKey: this.opts.accessKey,
                secretKey: this.opts.secretKey,
            });
            const exists = await this.client.bucketExists(this.opts.bucket);
            if (!exists) await this.client.makeBucket(this.opts.bucket, this.opts.region);
            this.replaceWithAlternativeUrlFor = {
                user: parseAlternativeEndpointUrl(this.opts.endPointForUser),
                judge: parseAlternativeEndpointUrl(this.opts.endPointForJudge),
            };
            await this.put('storage.test', Buffer.from('test'));
            const result = await streamToBuffer(await this.get('storage.test'));
            assert(result.toString() === 'test');
            await this.del('storage.test');
            logger.success('Storage connected.');
            this.error = null;
        } catch (e) {
            logger.warn('Storage init fail. will retry later.');
            this.error = e.toString();
            setTimeout(async () => {
                const [endPoint, accessKey, secretKey, bucket, region, endPointForUser, endPointForJudge] = system.getMany([
                    'file.endPoint', 'file.accessKey', 'file.secretKey', 'file.bucket', 'file.region',
                    'file.endPointForUser', 'file.endPointForJudge',
                ]);
                const sopts = {
                    endPoint, accessKey, secretKey, bucket, region, endPointForUser, endPointForJudge,
                };
                await this.start(sopts);
            }, 10000);
        }
    }

    async put(target: string, file: string | Buffer | Readable, meta: ItemBucketMetadata = {}) {
        if (typeof file === 'string') file = createReadStream(file);
        return await this.client.putObject(this.opts.bucket, target, file, meta);
    }

    async get(target: string, path?: string) {
        if (path) return await this.client.fGetObject(this.opts.bucket, target, path);
        return await this.client.getObject(this.opts.bucket, target);
    }

    async del(target: string | string[]) {
        if (typeof target === 'string') return await this.client.removeObject(this.opts.bucket, target);
        return await this.client.removeObjects(this.opts.bucket, target);
    }

    async list(target: string, recursive = true) {
        const stream = this.client.listObjects(this.opts.bucket, target, recursive);
        return await new Promise<BucketItem[]>((resolve, reject) => {
            const results: BucketItem[] = [];
            stream.on('data', (result) => {
                if (result.size) {
                    results.push({
                        ...result,
                        prefix: target,
                        name: result.name.split(target)[1],
                    });
                }
            });
            stream.on('end', () => resolve(results));
            stream.on('error', reject);
        });
    }

    async getMeta(target: string) {
        const result = await this.client.statObject(this.opts.bucket, target);
        return { ...result.metaData, ...result };
    }

    async signDownloadLink(target: string, filename?: string, noExpire = false, useAlternativeEndpointFor?: 'user' | 'judge'): Promise<string> {
        const url = await this.client.presignedGetObject(
            this.opts.bucket,
            target,
            noExpire ? 24 * 60 * 60 * 7 : 30 * 60,
            filename
                ? { 'response-content-disposition': `attachment; filename="${encodeRFC5987ValueChars(filename)}"` }
                : {},
        );
        if (useAlternativeEndpointFor) return this.replaceWithAlternativeUrlFor[useAlternativeEndpointFor](url);
        return url;
    }
}

const service = new StorageService();
global.Hydro.service.storage = service;
export = service;
