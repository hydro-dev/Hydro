import yaml from 'js-yaml';
import Schema from 'schemastery';
import { Context, Service } from './context';
import { Logger } from './logger';

const logger = new Logger('settings');

declare module './context' {
    interface Context {
        config: ConfigService;
    }
}

export class ConfigService extends Service {
    static inject = ['db'];

    settings: Schema[] = [];
    private systemConfig: any = {};
    configSource: string = '';

    constructor(ctx: Context) {
        super(ctx, 'config');
    }

    async [Service.setup]() {
        return await this.loadConfig();
    }

    async loadConfig() {
        const config = await this.ctx.db.collection('system').findOne({ _id: 'config' });
        try {
            this.configSource = config?.value || '{}';
            this.systemConfig = yaml.load(this.configSource);
            this.ctx.emit('system/setting', { config: this.configSource });
            logger.info('Successfully loaded config');
        } catch (e) {
            logger.error('Failed to load config', e.message);
        }
    }

    applyDelta(source: any, key: string, value: any) {
        const path = key.split('.');
        if (path.filter((i) => ['__proto__', 'prototype', 'constructor'].includes(i)).length) return false;
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

    async setConfig(key: string, value: any) {
        const newConfig = this.applyDelta(this.systemConfig, key, value);
        await this.saveConfig(newConfig);
    }

    requestConfig<T, S>(s: Schema<T, S>, dynamic = true): ReturnType<Schema<T, S>> {
        if (dynamic) {
            this.ctx.effect(() => {
                this.settings.push(s);
                return () => {
                    this.settings = this.settings.filter((v) => v !== s);
                };
            });
        }
        let curValue = s(this.systemConfig);
        if (dynamic) {
            this.ctx.on('system/setting', () => {
                try {
                    curValue = s(this.systemConfig);
                } catch (e) {
                    logger.warn('Cannot read config: ', e.message);
                    curValue = null;
                }
            });
        }
        const that = this;
        const getAccess = (path: (string | symbol)[]) => {
            let currentValue = curValue;
            for (const p of path) {
                currentValue = currentValue[p];
            }
            if (typeof currentValue !== 'object') return curValue;
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
