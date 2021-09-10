import {
    Ingest, PushOptions,
    QueryOptions,     Search, SuggestOptions } from 'sonic-channel';
import { BaseService } from 'hydrooj';
import { Logger } from 'hydrooj/src/logger';
import * as system from 'hydrooj/src/model/system';

const logger = new Logger('sonic');

declare module 'hydrooj/src/interface' {
    interface SystemKeys {
        'sonic.host': string;
        'sonic.port': number;
        'sonic.auth': string;
    }
}

function getHandler(type: string, that: any) {
    return {
        connected() {
            that.started = true;
            logger.info(`Sonic Channel succeeded to connect to host (${type}).`);
        },
        disconnected() {
            that.started = false;
            logger.error(`Sonic Channel is now disconnected (${type}).`);
        },
        timeout() {
            logger.error(`Sonic Channel connection timed out (${type}).`);
        },
        retrying() {
            logger.error(`Trying to reconnect to Sonic Channel (${type})...`);
        },
        error(error) {
            that.error = error;
            logger.error(`Sonic Channel failed to connect to host (${type}).`, error);
        },
    };
}

class SonicService implements BaseService {
    public search: Search;
    public ingest: Ingest;
    public started = false;
    public error = '';

    async start() {
        const [host, port, auth] = system.getMany(['sonic.host', 'sonic.port', 'sonic.auth']);
        const cfg = {
            host: host || '::1',
            port: port || 1491,
            auth: auth || '',
        };
        this.search = new Search(cfg);
        this.ingest = new Ingest(cfg);
        await this.connect();
    }

    async connect() {
        try {
            this.search.connect(getHandler('search', this));
            this.ingest.connect(getHandler('ingest', this));
        } catch (e) {
            logger.warn('Sonic init fail. will retry later.');
            this.error = e.toString();
            setTimeout(() => this.start(), 10000);
        }
    }

    async query(collection: string, bucket: string, terms: string, options?: QueryOptions) {
        return await this.search.query(collection, bucket, terms, options);
    }

    async suggest(collection: string, bucket: string, word: string, options?: SuggestOptions) {
        return await this.search.suggest(collection, bucket, word, options);
    }

    async push(collection: string, bucket: string, object: string, text: string, options?: PushOptions) {
        return await this.ingest.push(collection, bucket, object, text, options);
    }

    async pop(collection: string, bucket: string, object: string, text: string) {
        return await this.ingest.pop(collection, bucket, object, text);
    }

    async count(collection: string, bucket?: string, object?: string) {
        return await this.ingest.count(collection, bucket, object);
    }

    async flusho(collection: string, bucket: string, object: string) {
        return await this.ingest.flusho(collection, bucket, object);
    }

    async flushb(collection: string, bucket: string) {
        return await this.ingest.flushb(collection, bucket);
    }

    async flushc(collection: string) {
        return await this.ingest.flushc(collection);
    }

    async stop() {
        await Promise.all([
            this.search.close(),
            this.ingest.close(),
        ]);
    }
}

const service = new SonicService();
global.Hydro.service.sonic = service;
export = service;
declare module 'hydrooj/src/interface' {
    interface Service {
        sonic: typeof service
    }
}
