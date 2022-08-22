import yaml from 'js-yaml';
import { nanoid } from 'nanoid';
import Schema from 'schemastery';
import * as bus from 'hydrooj/src/service/bus';
import { Logger } from './logger';

const FileSetting = Schema.intersect([
    Schema.object({
        type: Schema.union([
            Schema.const('file').description('local file provider').required(),
            Schema.const('s3').description('s3 provider').required(),
        ] as const).description('provider type').default('file'),
        endPointForUser: Schema.string().default('/fs/').required(),
        endPointForJudge: Schema.string().default('/fs/').required(),
    }).description('setting_file'),
    Schema.union([
        Schema.object({
            type: Schema.const('file').required(),
            path: Schema.string().default('/data/file/hydro').description('Storage path').required(),
            secret: Schema.string().description('Download file sign secret').default(nanoid()),
        }),
        Schema.object({
            type: Schema.const('s3').required(),
            endPoint: Schema.string().required(),
            accessKey: Schema.string().required().description('access key'),
            secretKey: Schema.string().required().description('secret key').role('secret'),
            bucket: Schema.string().default('hydro').required(),
            region: Schema.string().default('us-east-1').required(),
            pathStyle: Schema.boolean().default(true).required(),
        }),
    ] as const),
] as const).default({
    type: 'file',
    path: '/data/file/hydro',
    endPointForUser: '/fs/',
    endPointForJudge: '/fs/',
    secret: nanoid(),
});

const builtinSettings = Schema.object({
    file: FileSetting,
});
export const SystemSettings: Schema<any, any>[] = [builtinSettings];
export let configSource = ''; // eslint-disable-line import/no-mutable-exports
export let systemConfig: any = {}; // eslint-disable-line import/no-mutable-exports
const logger = new Logger('settings');
const update = [];

export function requestConfig<T, S>(s: Schema<T, S>): ReturnType<Schema<T, S>> {
    SystemSettings.push(s);
    let curValue = s(systemConfig);
    update.push(() => {
        try {
            console.log(systemConfig);
            curValue = s(systemConfig);
        } catch (e) {
            logger.warn('Cannot read config: ', e.message);
            curValue = null;
        }
    });
    return new Proxy(curValue as any, {
        get(self, key: string) {
            return curValue?.[key];
        },
        set(self) {
            throw new Error(`Not allowed to set setting ${self.p.join('.')}`);
        },
    });
}

export const builtinConfig = requestConfig(builtinSettings);

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
    bus.broadcast('config/update');
}
bus.on('config/update', loadConfig);
