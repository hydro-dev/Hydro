import yaml from 'js-yaml';
import { nanoid } from 'nanoid';
import Schema from 'schemastery';
import { Logger } from './logger';
import { Flatten } from './typeutils';

const defaultPath = process.env.CI ? '/tmp/file'
    : process.env.DEFAULT_STORE_PATH || '/data/file/hydro';
const FileSetting = Schema.intersect([
    Schema.object({
        type: Schema.union([
            Schema.const('file').description('local file provider'),
            Schema.const('s3').description('s3 provider'),
        ] as const).description('provider type'),
        endPointForUser: Schema.string().default('/fs/'),
        endPointForJudge: Schema.string().default('/fs/'),
    }).description('setting_file'),
    Schema.union([
        Schema.object({
            type: Schema.const('file').required(),
            path: Schema.string().default(defaultPath).description('Storage path'),
            secret: Schema.string().description('Download file sign secret').default(nanoid()),
        }),
        Schema.object({
            type: Schema.const('s3').required(),
            endPoint: Schema.string(),
            accessKey: Schema.string().description('access key'),
            secretKey: Schema.string().description('secret key').role('secret'),
            bucket: Schema.string().default('hydro'),
            region: Schema.string().default('us-east-1'),
            pathStyle: Schema.boolean().default(true),
        }),
    ] as const),
] as const).default({
    type: 'file',
    path: defaultPath,
    endPointForUser: '/fs/',
    endPointForJudge: '/fs/',
    secret: nanoid(),
});

const builtinSettings = Schema.object({
    file: FileSetting,
});
export const SystemSettings: Schema[] = [builtinSettings];
export let configSource = ''; // eslint-disable-line import/no-mutable-exports
export let systemConfig: any = {}; // eslint-disable-line import/no-mutable-exports
const logger = new Logger('settings');
const update = [];

export async function loadConfig() {
    const config = await global.Hydro.service.db.collection('system').findOne({ _id: 'config' });
    try {
        configSource = config?.value || '{}';
        systemConfig = yaml.load(configSource);
        logger.info('Successfully loaded config');
        for (const u of update) u();
    } catch (e) {
        logger.error('Failed to load config', e.message);
    }
}
export async function saveConfig(config: any) {
    Schema.intersect(SystemSettings)(config);
    const value = yaml.dump(config);
    await global.Hydro.service.db.collection('system').updateOne({ _id: 'config' }, { $set: { value } }, { upsert: true });
    loadConfig();
}
export async function setConfig(key: string, value: any) {
    const path = key.split('.');
    if (path.filter((i) => ['__proto__', 'prototype'].includes(i)).length) throw new Error('Invalid key');
    const t = path.pop();
    let cursor = systemConfig;
    for (const p of path) {
        cursor[p] ||= {};
        cursor = cursor[p];
    }
    cursor[t] = value;
    await saveConfig(systemConfig);
}

export function requestConfig<T, S>(s: Schema<T, S>): {
    config: ReturnType<Schema<T, S>>,
    setConfig: (key: keyof Flatten<ReturnType<Schema<T, S>>> & string, value: any) => Promise<void>,
} {
    SystemSettings.push(s);
    let curValue = s(systemConfig);
    update.push(() => {
        try {
            curValue = s(systemConfig);
        } catch (e) {
            logger.warn('Cannot read config: ', e.message);
            curValue = null;
        }
    });
    return {
        config: new Proxy(curValue as any, {
            get(self, key: string) {
                return curValue?.[key];
            },
            set(self) {
                throw new Error(`Not allowed to set setting ${self.p.join('.')}`);
            },
        }),
        setConfig,
    };
}

const builtin = requestConfig(builtinSettings);
export const builtinConfig = builtin.config;
export const setBuiltinConfig = builtin.setConfig;
