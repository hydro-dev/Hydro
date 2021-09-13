/* eslint-disable no-await-in-loop */
import {
    Collection, Db, IndexSpecification, MongoClient,
} from 'mongodb';
import { BaseService, Collections } from '../interface';
import { Logger } from '../logger';
import * as bus from './bus';

const logger = new Logger('mongo');

interface MongoConfig {
    protocol?: string,
    username?: string,
    password?: string,
    host?: string,
    port?: string,
    name?: string,
    url?: string,
    prefix?: string,
}

class MongoService implements BaseService {
    public client: MongoClient;
    public client2: MongoClient;
    public db: Db;
    public db2: Db;
    public started = false;
    private opts: MongoConfig;

    static buildUrl(opts: MongoConfig) {
        let mongourl = `${opts.protocol || 'mongodb'}://`;
        if (opts.username) mongourl += `${opts.username}:${encodeURIComponent(opts.password)}@`;
        mongourl += `${opts.host}:${opts.port}/${opts.name}`;
        if (opts.url) mongourl = opts.url;
        return mongourl;
    }

    async start(opts: MongoConfig) {
        this.opts = opts;
        const mongourl = MongoService.buildUrl(opts);
        this.client = await MongoClient.connect(mongourl, { useNewUrlParser: true, useUnifiedTopology: true });
        this.db = this.client.db(opts.name);
        this.client2 = await MongoClient.connect(mongourl, { useNewUrlParser: true, useUnifiedTopology: true });
        this.db2 = this.client2.db(opts.name);
        await bus.parallel('database/connect', this.db);
        this.started = true;
    }

    public collection<K extends keyof Collections>(c: K): Collection<Collections[K]> {
        if (this.opts.prefix) return this.db.collection(`${this.opts.prefix}.${c}`);
        return this.db.collection(c);
    }

    public async ensureIndexes<T>(coll: Collection<T>, ...args: IndexSpecification[]) {
        if (process.env.NODE_APP_INSTANCE !== '0') return;
        let existed: any[];
        try {
            existed = await coll.listIndexes().toArray();
        } catch (e) {
            existed = [];
        }
        for (const index of args) {
            let i = existed.find((t) => t.name === index.name || JSON.stringify(t.key) === JSON.stringify(index.key));
            if (!i && Object.keys(index.key).map((k) => index.key[k]).includes('text')) {
                i = existed.find((t) => t.textIndexVersion);
            }
            index.background = true;
            if (!i) {
                logger.info('Indexing %s.%s with key %o', coll.collectionName, index.name, index.key);
                await coll.createIndexes([index]);
            } else if (i.v < 2 || i.name !== index.name || JSON.stringify(i.key) !== JSON.stringify(index.key)) {
                if (i.textIndexVersion) {
                    const cur = Object.keys(i.key).filter((t) => !t.startsWith('_')).map((k) => `${k}:${i.key[k]}`);
                    for (const key of Object.keys(i.weights)) cur.push(`${key}:text`);
                    const wanted = Object.keys(index.key).map((key) => `${key}:${index.key[key]}`);
                    if (cur.sort().join(' ') === wanted.sort().join(' ') && i.name === index.name) continue;
                }
                logger.info('Re-Index %s.%s with key %o', coll.collectionName, index.name, index.key);
                await coll.dropIndex(i.name);
                await coll.createIndexes([index]);
            }
        }
    }
}

const service = new MongoService();
global.Hydro.service.db = service;
export = service;
