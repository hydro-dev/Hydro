import { resolve } from 'path';
import { Readable } from 'stream';
import { URL } from 'url';
import {
    copyFile, createReadStream, ensureDir,
    remove, stat, writeFile,
} from 'fs-extra';
import { lookup } from 'mime-types';
import { BucketItem, Client, ItemBucketMetadata } from 'minio';
import { md5 } from '../lib/crypto';
import { Logger } from '../logger';
import { builtinConfig } from '../settings';
import { MaybeArray } from '../typeutils';

const logger = new Logger('storage');

interface StorageOptions {
    endPoint: string;
    accessKey: string;
    secretKey: string;
    bucket: string;
    region?: string;
    pathStyle: boolean;
    endPointForUser?: string;
    endPointForJudge?: string;
}

interface MinioEndpointConfig {
    endPoint: string;
    port: number;
    useSSL: boolean;
}

function parseMainEndpointUrl(endpoint: string): MinioEndpointConfig {
    if (!endpoint) throw new Error('Empty endpoint');
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
export function encodeRFC5987ValueChars(str: string) {
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

class RemoteStorageService {
    public client: Client;
    public error = '';
    public opts: StorageOptions;
    private replaceWithAlternativeUrlFor: Record<'user' | 'judge', (originalUrl: string) => string>;

    async start() {
        try {
            logger.info('Starting storage service with endpoint:', builtinConfig.file.endPoint);
            const {
                endPoint,
                accessKey,
                secretKey,
                bucket,
                region,
                pathStyle,
                endPointForUser,
                endPointForJudge,
            } = builtinConfig.file;
            this.opts = {
                endPoint,
                accessKey,
                secretKey,
                bucket,
                region,
                pathStyle,
                endPointForUser,
                endPointForJudge,
            };
            this.client = new Client({
                ...parseMainEndpointUrl(this.opts.endPoint),
                pathStyle: this.opts.pathStyle,
                accessKey: this.opts.accessKey,
                secretKey: this.opts.secretKey,
            });
            try {
                const exists = await this.client.bucketExists(this.opts.bucket);
                if (!exists) await this.client.makeBucket(this.opts.bucket, this.opts.region);
            } catch (e) {
                // Some platform doesn't support bucketExists & makeBucket API.
                // Ignore this error.
            }
            this.replaceWithAlternativeUrlFor = {
                user: parseAlternativeEndpointUrl(this.opts.endPointForUser),
                judge: parseAlternativeEndpointUrl(this.opts.endPointForJudge),
            };
            logger.success('Storage connected.');
            this.error = null;
        } catch (e) {
            logger.warn('Storage init fail. will retry later.');
            if (process.env.DEV) logger.warn(e);
            this.error = e.toString();
            setTimeout(() => this.start(), 10000);
        }
    }

    async put(target: string, file: string | Buffer | Readable, meta: ItemBucketMetadata = {}) {
        if (target.includes('..') || target.includes('//')) throw new Error('Invalid path');
        if (typeof file === 'string') file = createReadStream(file);
        try {
            await this.client.putObject(this.opts.bucket, target, file, meta);
        } catch (e) {
            e.stack = new Error().stack;
            throw e;
        }
    }

    async get(target: string, path?: string) {
        if (target.includes('..') || target.includes('//')) throw new Error('Invalid path');
        try {
            if (path) return await this.client.fGetObject(this.opts.bucket, target, path);
            return await this.client.getObject(this.opts.bucket, target);
        } catch (e) {
            e.stack = new Error().stack;
            throw e;
        }
    }

    async del(target: string | string[]) {
        if (typeof target === 'string') {
            if (target.includes('..') || target.includes('//')) throw new Error('Invalid path');
        } else if (target.find((t) => t.includes('..') || t.includes('//'))) throw new Error('Invalid path');
        try {
            if (typeof target === 'string') return await this.client.removeObject(this.opts.bucket, target);
            return await this.client.removeObjects(this.opts.bucket, target);
        } catch (e) {
            e.stack = new Error().stack;
            throw e;
        }
    }

    /** @deprecated use StorageModel.list instead. */
    async list(target: string, recursive = true) {
        if (target.includes('..') || target.includes('//')) throw new Error('Invalid path');
        try {
            const stream = this.client.listObjects(this.opts.bucket, target, recursive);
            return await new Promise<BucketItem[]>((r, reject) => {
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
                stream.on('end', () => r(results));
                stream.on('error', reject);
            });
        } catch (e) {
            e.stack = new Error().stack;
            throw e;
        }
    }

    async getMeta(target: string) {
        if (target.includes('..') || target.includes('//')) throw new Error('Invalid path');
        try {
            const result = await this.client.statObject(this.opts.bucket, target);
            return { ...result.metaData, ...result };
        } catch (e) {
            e.stack = new Error().stack;
            throw e;
        }
    }

    async signDownloadLink(target: string, filename?: string, noExpire = false, useAlternativeEndpointFor?: 'user' | 'judge'): Promise<string> {
        if (target.includes('..') || target.includes('//')) throw new Error('Invalid path');
        try {
            const headers: Record<string, string> = {};
            if (filename) headers['response-content-disposition'] = `attachment; filename="${encodeRFC5987ValueChars(filename)}"`;
            const url = await this.client.presignedGetObject(
                this.opts.bucket,
                target,
                noExpire ? 24 * 60 * 60 * 7 : 10 * 60,
                headers,
            );
            if (useAlternativeEndpointFor) return this.replaceWithAlternativeUrlFor[useAlternativeEndpointFor](url);
            return url;
        } catch (e) {
            e.stack = new Error().stack;
            throw e;
        }
    }

    async signUpload(target: string, size: number) {
        const policy = this.client.newPostPolicy();
        policy.setBucket(this.opts.bucket);
        policy.setKey(target);
        policy.setExpires(new Date(Date.now() + 30 * 60 * 1000));
        if (size) policy.setContentLengthRange(size - 50, size + 50);
        const policyResult = await this.client.presignedPostPolicy(policy);
        return {
            url: this.replaceWithAlternativeUrlFor.user(policyResult.postURL),
            extraFormData: policyResult.formData,
        };
    }
}

class LocalStorageService {
    client: null;
    error: null;
    dir: string;
    opts: null;
    private replaceWithAlternativeUrlFor: Record<'user' | 'judge', (originalUrl: string) => string>;

    async start() {
        logger.debug('Loading local storage service with path:', builtinConfig.file.path);
        await ensureDir(builtinConfig.file.path);
        this.dir = builtinConfig.file.path;
        this.replaceWithAlternativeUrlFor = {
            user: parseAlternativeEndpointUrl(builtinConfig.file.endPointForUser),
            judge: parseAlternativeEndpointUrl(builtinConfig.file.endPointForJudge),
        };
    }

    async put(target: string, file: string | Buffer | Readable) {
        if (target.includes('..') || target.includes('//')) throw new Error('Invalid path');
        target = resolve(this.dir, target);
        if (typeof file === 'string') await copyFile(file, target);
        else await writeFile(target, file);
    }

    async get(target: string, path?: string) {
        if (target.includes('..') || target.includes('//')) throw new Error('Invalid path');
        target = resolve(this.dir, target);
        if (path) await copyFile(target, path);
        return createReadStream(target);
    }

    async del(target: MaybeArray<string>) {
        const targets = typeof target === 'string' ? [target] : target;
        if (targets.find((i) => i.includes('..') || i.includes('//'))) throw new Error('Invalid path');
        await Promise.all(targets.map((i) => remove(resolve(this.dir, i))));
    }

    async getMeta(target: string) {
        if (target.includes('..') || target.includes('//')) throw new Error('Invalid path');
        target = resolve(this.dir, target);
        const file = await stat(target);
        return {
            size: file.size,
            etag: Buffer.from(target).toString('base64'),
            lastModified: file.mtime,
            metaData: {
                'Content-Type': (target.endsWith('.ans') || target.endsWith('.out'))
                    ? 'text/plain'
                    : lookup(target) || 'application/octet-stream',
                'Content-Length': file.size,
            },
        };
    }

    async signDownloadLink(target: string, filename?: string, noExpire = false, useAlternativeEndpointFor?: 'user' | 'judge'): Promise<string> {
        if (target.includes('..') || target.includes('//')) throw new Error('Invalid path');
        const url = new URL('https://localhost/storage');
        url.searchParams.set('target', target);
        url.searchParams.set('filename', filename);
        const expire = (Date.now() + (noExpire ? 7 * 24 * 3600 : 600) * 1000).toString();
        url.searchParams.set('expire', expire);
        url.searchParams.set('secret', md5(`${target}/${expire}/${builtinConfig.file.secret}`));
        if (useAlternativeEndpointFor) return this.replaceWithAlternativeUrlFor[useAlternativeEndpointFor](url.toString());
        return url.toString().split('localhost/')[1];
    }

    async signUpload() {
        throw new Error('Not implemented');
        return null;
    }

    async list() {
        throw new Error('deprecated');
        return [];
    }
}

let service; // eslint-disable-line import/no-mutable-exports

export async function loadStorageService() {
    service = builtinConfig.file.type === 's3' ? new RemoteStorageService() : new LocalStorageService();
    global.Hydro.service.storage = service;
    await service.start();
}

export default new Proxy({}, {
    get(self, key) {
        return service[key];
    },
}) as RemoteStorageService | LocalStorageService;
