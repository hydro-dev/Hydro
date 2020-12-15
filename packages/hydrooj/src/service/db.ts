import { Collection, Db, MongoClient } from 'mongodb';
import * as bus from './bus';
import { Collections } from '../interface';

interface MongoConfig {
    username?: string,
    password?: string,
    host?: string,
    port?: string,
    name?: string,
    url?: string,
    prefix?: string,
}

class MongoService {
    public client: MongoClient;
    public client2: MongoClient;
    public db: Db;
    public db2: Db;
    private opts: MongoConfig;

    async start(opts: MongoConfig) {
        this.opts = opts;
        let mongourl = 'mongodb://';
        if (opts.username) mongourl += `${opts.username}:${opts.password}@`;
        mongourl += `${opts.host}:${opts.port}/${opts.name}`;
        if (opts.url) mongourl = opts.url;
        this.client = await MongoClient.connect(mongourl, { useNewUrlParser: true, useUnifiedTopology: true });
        this.db = this.client.db(opts.name);
        this.client2 = await MongoClient.connect(mongourl, { useNewUrlParser: true, useUnifiedTopology: true });
        this.db2 = this.client2.db(opts.name);
        bus.parallel('database/connect', this.db);
    }

    public collection<K extends keyof Collections>(c: K): Collection<Collections[K]> {
        if (this.opts.prefix) return this.db.collection(`${this.opts.prefix}.${c}`);
        return this.db.collection(c);
    }
}

const service = new MongoService();
global.Hydro.service.db = service;
export = service;
