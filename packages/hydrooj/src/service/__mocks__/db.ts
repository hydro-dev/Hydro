// @ts-nocheck
import { Collection, Db, MongoClient } from 'mongodb';
import { BaseService, Collections } from '../../interface';
import * as bus from '../bus';

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

    async start(opts: MongoConfig) {
        this.opts = opts;
        this.client = await MongoClient.connect(global.__MONGO_URI__, { useNewUrlParser: true, useUnifiedTopology: true });
        this.db = this.client.db(global.__MONGO_DB_NAME_);
        this.client2 = await MongoClient.connect(global.__MONGO_URI__, { useNewUrlParser: true, useUnifiedTopology: true });
        this.db2 = this.client2.db(global.__MONGO_DB_NAME_);
        await bus.parallel('database/connect', this.db);
        this.started = true;
    }

    public collection<K extends keyof Collections>(c: K): Collection<Collections[K]> {
        if (this.opts.prefix) return this.db.collection(`${this.opts.prefix}.${c}`);
        return this.db.collection(c);
    }

    public async stop() {
        await this.client.close();
        await this.client2.close();
        await this.db.close();
        await this.db2.close();
    }
}

const service = new MongoService();
global.Hydro.service.db = service as any;
export = service;
