import { Collection, Db, MongoClient } from 'mongodb';
import { BaseService, Collections } from '../interface';
import * as bus from './bus';

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
}

const service = new MongoService();
global.Hydro.service.db = service;
export = service;
