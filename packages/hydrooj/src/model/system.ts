import { Context, Service } from '../context';
import { SystemKeys } from '../interface';
import { serviceInstance } from '../utils';
import { SYSTEM_SETTINGS } from './setting';

class SystemModelService extends Service {
    static readonly inject = ['db'];
    static readonly name = 'model:system';

    coll = this.ctx.db.collection('system');
    cache: Record<string, any> = Object.create(null);

    constructor(ctx: Context) {
        super(ctx, 'model:system');
    }

    get<K extends keyof SystemKeys>(key: K): SystemKeys[K];
    get(key: string): any;
    get(key: string): any {
        return this.cache[key];
    }

    getMany<
        A extends keyof SystemKeys, B extends keyof SystemKeys,
    >(keys: [A, B]): [SystemKeys[A], SystemKeys[B]];
    getMany<
        A extends keyof SystemKeys, B extends keyof SystemKeys, C extends keyof SystemKeys,
    >(keys: [A, B, C]): [SystemKeys[A], SystemKeys[B], SystemKeys[C]];
    getMany<
        A extends keyof SystemKeys, B extends keyof SystemKeys, C extends keyof SystemKeys,
        D extends keyof SystemKeys,
    >(keys: [A, B, C, D]): [SystemKeys[A], SystemKeys[B], SystemKeys[C], SystemKeys[D]];
    getMany<
        A extends keyof SystemKeys, B extends keyof SystemKeys, C extends keyof SystemKeys,
        D extends keyof SystemKeys, E extends keyof SystemKeys,
    >(keys: [A, B, C, D, E]): [SystemKeys[A], SystemKeys[B], SystemKeys[C], SystemKeys[D], SystemKeys[E]];
    getMany<
        A extends keyof SystemKeys, B extends keyof SystemKeys, C extends keyof SystemKeys,
        D extends keyof SystemKeys, E extends keyof SystemKeys, F extends keyof SystemKeys,
    >(keys: [A, B, C, D, E, F]): [SystemKeys[A], SystemKeys[B], SystemKeys[C], SystemKeys[D], SystemKeys[E], SystemKeys[F]];
    getMany(keys: (keyof SystemKeys)[]): any[];
    getMany(keys: string[]): any[] {
        return keys.map((key) => this.cache[key]);
    }

    async set<K extends keyof SystemKeys>(_id: K, value: SystemKeys[K], broadcast?: boolean): Promise<SystemKeys[K]>;
    async set<K>(_id: string, value: K, broadcast?: boolean): Promise<K>;
    async set(_id: string, value: any, broadcast = true) {
        if (broadcast) this.ctx.broadcast('system/setting', { [_id]: value });
        const res = await this.coll.findOneAndUpdate(
            { _id },
            { $set: { value } },
            { upsert: true, returnDocument: 'after' },
        );
        this.cache[_id] = res.value;
        return res.value;
    }

    async [Service.init]() {
        for (const setting of SYSTEM_SETTINGS) {
            if (setting.value) this.cache[setting.key] = setting.value;
        }
        const config = await this.coll.find().toArray();
        for (const i of config) this.cache[i._id] = i.value;
        this.ctx.emit('database/config');
        return this.ctx.on('system/setting', (args) => {
            for (const key in args) this.cache[key] = args[key];
        });
    }
}

const SystemModel = serviceInstance(SystemModelService);
export default SystemModel;
global.Hydro.model.system = SystemModel;
