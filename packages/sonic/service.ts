import {
    Ingest, PushOptions, QueryOptions,
    Search, SuggestOptions,
} from 'sonic-channel';
import {
    Context, Logger, Service, SystemModel,
} from 'hydrooj';

declare module 'hydrooj' {
    interface SystemKeys {
        'sonic.host': string;
        'sonic.port': number;
        'sonic.auth': string;
    }
    interface Context {
        sonic?: SonicService;
    }
}

const logger = new Logger('sonic');

function getHandler(type: string, that: any) {
    return {
        connected() {
            logger.info(`Sonic Channel succeeded to connect to host (${type}).`);
        },
        disconnected() {
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

export class SonicService extends Service {
    public search: Search;
    public ingest: Ingest;
    public error = '';

    constructor(ctx: Context) {
        super(ctx, 'sonic', true);
    }

    async start() {
        const [host, port, auth] = SystemModel.getMany(['sonic.host', 'sonic.port', 'sonic.auth']);
        const cfg = {
            host: host || '::1',
            port: port || 1491,
            auth: auth || '',
        };
        this.search = new Search(cfg);
        this.ingest = new Ingest(cfg);
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
