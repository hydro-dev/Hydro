import yaml from 'js-yaml';
import Schema from 'schemastery';
import { Context, Service } from './context';
import { Logger } from './logger';
import {
    AccountSetting, DomainSetting, DomainUserSetting, PreferenceSetting, SystemSetting,
} from './model/setting';

const logger = new Logger('settings');

declare module 'cordis' {
    interface Context {
        setting: SettingService;
    }
}

const T = <F extends (...args: any[]) => any>(origFunc: F, disposeFunc?) =>
    function method(this: Service, ...args: Parameters<F>) {
        this.ctx.effect(() => {
            const res = origFunc(...args);
            return () => (disposeFunc ? disposeFunc(res) : res());
        });
    };

export class SettingService extends Service {
    static inject = ['db'];
    static name = 'setting';
    static blacklist = ['__proto__', 'prototype', 'constructor'];

    settings: Schema[] = [];
    private systemConfig: any = {};
    configSource: string = '';
    private applied: any = {};
    private initialValues = {};
    private _lastMigrate = Promise.resolve();

    PreferenceSetting = T(PreferenceSetting);
    AccountSetting = T(AccountSetting);
    DomainSetting = T(DomainSetting);
    DomainUserSetting = T(DomainUserSetting);
    SystemSetting = T(SystemSetting);

    constructor(ctx: Context) {
        super(ctx, 'setting');
    }

    async [Context.init]() {
        const payload = await this.ctx.db.collection('system').find({}).toArray();
        this.initialValues = Object.fromEntries(payload.map((v) => [v._id, v.value]));
        return await this.loadConfig();
    }

    _applySchema() {
        this.applied = this.settings.length ? Schema.intersect(this.settings)(this.systemConfig) : this.systemConfig;
    }

    async loadConfig() {
        const config = await this.ctx.db.collection('system').findOne({ _id: 'config' }, {
            readPreference: 'primary', readConcern: 'majority',
        });
        try {
            this.configSource = config?.value || '{}';
            this.systemConfig = yaml.load(this.configSource);
            this._applySchema();
            this.ctx.emit('system/setting', { config: this.configSource });
            logger.info('Successfully loaded config');
        } catch (e) {
            logger.error('Failed to load config', e.message);
        }
    }

    applyDelta(source: any, key: string, value: any) {
        const path = key.split('.');
        if (path.some((i) => SettingService.blacklist.includes(i))) return false;
        const t = path.pop();
        const root = JSON.parse(JSON.stringify(source));
        let cursor = root;
        for (const p of path) {
            cursor[p] ??= {};
            cursor = cursor[p];
        }
        cursor[t] = value;
        return root;
    }

    isPatchValid(key: string, value: any) {
        const root = this.applyDelta(this.systemConfig, key, value);
        try {
            Schema.intersect(this.settings)(root);
        } catch (e) {
            return false;
        }
        return true;
    }

    async saveConfig(config: any) {
        Schema.intersect(this.settings)(config);
        const value = yaml.dump(config);
        await this.ctx.db.collection('system').updateOne({ _id: 'config' }, { $set: { value } }, { upsert: true });
        await this.loadConfig();
    }

    async _actualMigrate(schema: Schema<any>) {
        const processNode = async (path: string[], node: Schema<any, any>) => {
            for (const item of node.list || []) await processNode(path, item); // eslint-disable-line no-await-in-loop
            for (const key in node.dict || {}) await processNode(path.concat(key), node.dict[key]); // eslint-disable-line no-await-in-loop
            if (['string', 'number', 'boolean'].includes(node.type)) {
                const value = this.initialValues[path.join('.')];
                const migrated = this.initialValues[`${path.join('.')}__migrated`];
                if (migrated || !Object.hasOwn(this.initialValues, path.join('.'))) return;
                let parsed;
                try {
                    if (node.type === 'string') parsed = value;
                    if (node.type === 'number') parsed = +value;
                    if (node.type === 'boolean') parsed = !!value && !['off', '0', 'false'].includes(value);
                } catch (e) { }
                if (parsed === undefined) return;
                await this.ctx.db.collection('system').updateOne({ _id: `${path.join('.')}__migrated` }, { $set: { value: true } }, { upsert: true });
                this.ctx.logger.info('Migrating %s: %o', path.join('.'), parsed);
                await this.saveConfig(this.applyDelta(this.systemConfig, path.join('.'), parsed));
            }
        };
        await processNode([], schema);
    }

    async _tryMigrateConfig(schema: Schema<any>) {
        this._lastMigrate = this._lastMigrate.then(() => this._actualMigrate(schema));
        await this._lastMigrate;
    }

    _get(key: string) {
        const parts = key.split('.');
        if (parts.some((p) => SettingService.blacklist.includes(p.toString()))) throw new Error('Invalid path');
        let currentValue = this.applied;
        for (const p of parts) {
            if (!currentValue) return undefined;
            currentValue = currentValue[p];
        }
        return currentValue;
    }

    get(key: string) {
        return (this.ctx ? this.ctx.domain?.config?.[key.replace(/\./g, '$')] : null)
            ?? (this._get(key) || global.Hydro?.model?.system?.get?.(key));
    }

    async setConfig(key: string, value: any) {
        const newConfig = this.applyDelta(this.systemConfig, key, value);
        await this.saveConfig(newConfig);
    }

    requestConfig<T, S>(s: Schema<T, S>, dynamic = true): S {
        this.ctx.effect(() => {
            logger.debug('Loading config', s);
            this.settings.push(s);
            this._applySchema();
            return () => {
                logger.debug('Unloading config', s);
                this.settings = this.settings.filter((v) => v !== s);
                this._applySchema();
            };
        });
        let curValue = s(this.systemConfig);
        if (!dynamic) return curValue;
        this.ctx.on('system/setting', () => {
            try {
                curValue = s(this.systemConfig);
            } catch (e) {
                logger.warn('Cannot read config: ', e.message);
                curValue = null;
            }
        });
        const that = this;
        const getAccess = (path: (string | symbol)[]) => {
            if (path.some((p) => SettingService.blacklist.includes(p.toString()))) throw new Error(`Invalid path: ${path.join('.')}`);
            let currentValue = curValue;
            for (const p of path) currentValue = currentValue[p];
            if ((typeof currentValue !== 'object') || !currentValue || Array.isArray(currentValue)) return currentValue;
            if (path.some((p) => typeof p === 'symbol')) return currentValue;
            return new Proxy(currentValue, {
                get(self, key: string) {
                    return getAccess(path.concat(key));
                },
                set(self, p: string | symbol, newValue: any) {
                    that.setConfig(path.concat(p).join(','), newValue);
                    return true;
                },
            });
        };
        return getAccess([]);
    }
}
