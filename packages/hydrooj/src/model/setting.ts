/* eslint-disable max-len */
/* eslint-disable no-await-in-loop */
import fs from 'fs';
import yaml from 'js-yaml';
import { Dictionary } from 'lodash';
import moment from 'moment-timezone';
import saslPrep from 'saslprep';
import Schema from 'schemastery';
import { LangConfig, parseLang } from '@hydrooj/common';
import { findFileSync, randomstring, retry } from '@hydrooj/utils';
import { Context } from '../context';
import { Setting as _Setting } from '../interface';
import { Logger } from '../logger';
import * as builtin from './builtin';

type SettingDict = Dictionary<_Setting>;

const settingFile = yaml.load(fs.readFileSync(findFileSync('hydrooj/setting.yaml'), 'utf-8')) as any;

const logger = new Logger('model/setting');
const countries = moment.tz.countries();
const tzs = new Set();
for (const country of countries) {
    const tz = moment.tz.zonesForCountry(country);
    for (const t of tz) tzs.add(t);
}
const timezones = Array.from(tzs).sort().map((tz) => [tz, tz]) as [string, string][];
const langRange: Dictionary<string> = {};

export const FLAG_HIDDEN = 1;
export const FLAG_DISABLED = 2;
export const FLAG_SECRET = 4;
export const FLAG_PRO = 8;

export const PREFERENCE_SETTINGS: _Setting[] = [];
export const ACCOUNT_SETTINGS: _Setting[] = [];
export const DOMAIN_SETTINGS: _Setting[] = [];
export const DOMAIN_USER_SETTINGS: _Setting[] = [];
export const SYSTEM_SETTINGS: _Setting[] = [];
export const SETTINGS: _Setting[] = [];
export const SETTINGS_BY_KEY: SettingDict = {};
export const DOMAIN_USER_SETTINGS_BY_KEY: SettingDict = {};
export const DOMAIN_SETTINGS_BY_KEY: SettingDict = {};
export const SYSTEM_SETTINGS_BY_KEY: SettingDict = {};

export type SettingType = 'text' | 'yaml' | 'number' | 'float' | 'markdown' | 'password' | 'boolean' | 'textarea' | [string, string][] | Record<string, string> | 'json';

export const Setting = (
    family: string, key: string, value: any = null,
    type: SettingType = 'text', name = '', desc = '', flag = 0,
    validation?: (val: any) => boolean,
): _Setting => {
    let subType = '';
    if (type === 'yaml' && typeof value !== 'string') {
        value = yaml.dump(value);
        type = 'textarea';
        subType = 'yaml';
    }
    return {
        family,
        key,
        value,
        name,
        desc,
        flag,
        subType,
        type: typeof type === 'object' ? 'select' : type,
        range: typeof type === 'object' ? type : null,
        validation,
    };
};

declare global {
    namespace Schemastery {
        interface Meta<T> { // eslint-disable-line ts/no-unused-vars
            family?: string;
            secret?: boolean;
        }
    }
}

function schemaToSettings(schema: Schema<any>) {
    const result: _Setting[] = [];
    const processNode = (key: string, s: Schema<number> | Schema<string> | Schema<boolean>, defaultFamily = 'setting_basic') => {
        if (s.dict) throw new Error('Dict is not supported here');
        let flag = (s.meta?.hidden ? FLAG_HIDDEN : 0)
            | (s.meta?.disabled ? FLAG_DISABLED : 0);
        const actualType = s.type === 'transform' ? s.inner.type : s.type;
        const actualList = s.type === 'transform' ? s.inner.list : s.list;
        const type = actualType === 'any' ? 'json'
            : actualType === 'number' ? 'number'
                : actualType === 'boolean' ? 'boolean'
                    : s.meta?.role === 'markdown' ? 'markdown'
                        : s.meta?.role === 'textarea' ? 'textarea' : 'text';
        if (s.meta?.role === 'password') flag |= FLAG_SECRET;
        const options = {};
        for (const item of actualList || []) {
            if (item.type !== 'const') throw new Error(`List item must be a constant, got ${item.type}`);
            options[item.value] = item.meta?.description || item.value;
        }
        return {
            family: s.meta?.family || defaultFamily,
            key,
            value: s.meta?.default,
            name: key,
            desc: s.meta?.description,
            flag,
            subType: '',
            type: actualList ? 'select' : type,
            range: actualList ? options : null,
            validation: (v) => {
                try {
                    (s as any)(v);
                    return true;
                } catch (e) {
                    return false;
                }
            },
        } as _Setting;
    };
    if (!schema.dict) return [];
    for (const key in schema.dict) {
        const value = schema.dict[key];
        if (value.dict) {
            for (const subkey in value.dict) {
                result.push(processNode(`${key}.${subkey}`, value.dict[subkey], value.meta?.family));
            }
        } else result.push(processNode(key, value));
    }
    return result;
}

export const PreferenceSetting = (...settings: _Setting[] | Schema<any>[]) => {
    settings = settings.flatMap((s) => (s instanceof Schema ? schemaToSettings(s) : s) as _Setting[]);
    for (const setting of settings) {
        if (PREFERENCE_SETTINGS.find((s) => s.key === setting.key)) logger.warn(`Duplicate setting key: ${setting.key}`);
        PREFERENCE_SETTINGS.push(setting);
        SETTINGS.push(setting);
        SETTINGS_BY_KEY[setting.key] = setting;
    }
    return () => {
        for (const setting of settings) {
            delete SETTINGS_BY_KEY[setting.key];
            if (PREFERENCE_SETTINGS.includes(setting)) {
                PREFERENCE_SETTINGS.splice(PREFERENCE_SETTINGS.indexOf(setting), 1);
            }
            if (SETTINGS.includes(setting)) {
                SETTINGS.splice(SETTINGS.indexOf(setting), 1);
            }
        }
    };
};
export const AccountSetting = (...settings: _Setting[] | Schema<any>[]) => {
    settings = settings.flatMap((s) => (s instanceof Schema ? schemaToSettings(s) : s) as _Setting[]);
    for (const setting of settings) {
        if (ACCOUNT_SETTINGS.find((s) => s.key === setting.key)) logger.warn(`Duplicate setting key: ${setting.key}`);
        ACCOUNT_SETTINGS.push(setting);
        SETTINGS.push(setting);
        SETTINGS_BY_KEY[setting.key] = setting;
    }
    return () => {
        for (const setting of settings) {
            delete SETTINGS_BY_KEY[setting.key];
            if (ACCOUNT_SETTINGS.includes(setting)) {
                ACCOUNT_SETTINGS.splice(ACCOUNT_SETTINGS.indexOf(setting), 1);
            }
            if (SETTINGS.includes(setting)) {
                SETTINGS.splice(SETTINGS.indexOf(setting), 1);
            }
        }
    };
};
export const DomainUserSetting = (...settings: _Setting[] | Schema<any>[]) => {
    settings = settings.flatMap((s) => (s instanceof Schema ? schemaToSettings(s) : s) as _Setting[]);
    for (const setting of settings) {
        if (DOMAIN_USER_SETTINGS.find((s) => s.key === setting.key)) logger.warn(`Duplicate setting key: ${setting.key}`);
        DOMAIN_USER_SETTINGS.push(setting);
        DOMAIN_USER_SETTINGS_BY_KEY[setting.key] = setting;
    }
    return () => {
        for (const setting of settings) {
            delete DOMAIN_USER_SETTINGS_BY_KEY[setting.key];
            if (DOMAIN_USER_SETTINGS.includes(setting)) {
                DOMAIN_USER_SETTINGS.splice(DOMAIN_USER_SETTINGS.indexOf(setting), 1);
            }
        }
    };
};
export const DomainSetting = (...settings: _Setting[] | Schema<any>[]) => {
    settings = settings.flatMap((s) => (s instanceof Schema ? schemaToSettings(s) : s) as _Setting[]);
    for (const setting of settings) {
        if (DOMAIN_SETTINGS.find((s) => s.key === setting.key)) logger.warn(`Duplicate setting key: ${setting.key}`);
        DOMAIN_SETTINGS.push(setting);
        DOMAIN_SETTINGS_BY_KEY[setting.key] = setting;
    }
    return () => {
        for (const setting of settings) {
            delete DOMAIN_SETTINGS_BY_KEY[setting.key];
            if (DOMAIN_SETTINGS.includes(setting)) {
                DOMAIN_SETTINGS.splice(DOMAIN_SETTINGS.indexOf(setting), 1);
            }
        }
    };
};
export const SystemSetting = (...settings: _Setting[] | Schema<any>[]) => {
    settings = settings.flatMap((s) => (s instanceof Schema ? schemaToSettings(s) : s) as _Setting[]);
    for (const setting of settings) {
        if (SYSTEM_SETTINGS.find((s) => s.key === setting.key)) logger.warn(`Duplicate setting key: ${setting.key}`);
        SYSTEM_SETTINGS.push(setting);
        SYSTEM_SETTINGS_BY_KEY[setting.key] = setting;
    }
    return () => {
        for (const setting of settings) {
            delete SYSTEM_SETTINGS_BY_KEY[setting.key];
            if (SYSTEM_SETTINGS.includes(setting)) {
                SYSTEM_SETTINGS.splice(SYSTEM_SETTINGS.indexOf(setting), 1);
            }
        }
    };
};

const LangSettingNode = {
    family: 'setting_usage',
    key: 'codeLang',
    value: '',
    name: 'codeLang',
    desc: 'Default Code Language',
    flag: 0,
    subType: '',
    type: 'select',
    range: {},
};
const ServerLangSettingNode = {
    family: 'setting_server',
    key: 'preference.codeLang',
    value: '',
    name: 'preference.codeLang',
    desc: 'Default Code Language',
    flag: 0,
    subType: '',
    type: 'select',
    range: {},
};

PreferenceSetting(
    Setting('setting_display', 'viewLang', null, langRange, 'UI Language'),
    Setting('setting_display', 'timeZone', 'Asia/Shanghai', timezones, 'Timezone'),
    LangSettingNode,
    Setting('setting_usage', 'codeTemplate', '', 'textarea', 'Default Code Template',
        'If left blank, the built-in template of the corresponding language will be used.'),
);

AccountSetting(
    Setting('setting_info', 'avatar', '', 'text', 'Avatar',
        'Allow using gravatar:email qq:id github:name url:link format.'),
    Setting('setting_info', 'qq', null, 'text', 'QQ'),
    Setting('setting_info', 'gender', builtin.USER_GENDER_OTHER, builtin.USER_GENDER_RANGE, 'Gender'),
    Setting('setting_info', 'bio', null, 'markdown', 'Bio'),
    Setting('setting_info', 'school', '', 'text', 'School'),
    Setting('setting_info', 'studentId', '', 'text', 'Student ID'),
    Setting('setting_info', 'phone', null, 'text', 'Phone', null, FLAG_DISABLED),
    Setting('setting_customize', 'backgroundImage',
        '/components/profile/backgrounds/1.jpg', 'text', 'Profile Background Image',
        'Choose the background image in your profile page.'),
    Setting('setting_storage', 'unreadMsg', 0, 'number', 'Unread Message Count', null, FLAG_DISABLED | FLAG_HIDDEN),
    Setting('setting_storage', 'badge', '', 'text', 'badge info', null, FLAG_DISABLED | FLAG_HIDDEN),
    Setting('setting_storage', 'banReason', '', 'text', 'ban reason', null, FLAG_DISABLED | FLAG_HIDDEN),
    Setting('setting_storage', 'pinnedDomains', [], 'json', 'pinned domains', null, FLAG_DISABLED | FLAG_HIDDEN),
);

DomainSetting(
    Setting('setting_domain', 'name', 'New domain', 'text', 'name'),
    Setting('setting_domain', 'avatar', '', 'text', 'avatar', 'Will be used as the domain icon.'),
    Setting('setting_domain', 'share', '', 'text', 'Share problem with domain (* for any)'),
    Setting('setting_domain', 'bulletin', '', 'markdown', 'Bulletin'),
    Setting('setting_domain', 'langs', '', 'text', 'Allowed langs', null),
    Setting('setting_storage', 'host', '', 'text', 'Custom host', null, FLAG_HIDDEN | FLAG_DISABLED),
);

DomainUserSetting(Schema.object({
    displayName: Schema.transform(String, (input) => saslPrep(input)).default('').description('Display Name').extra('family', 'setting_info'),

    rpInfo: Schema.any().extra('family', 'setting_storage').disabled().hidden(),

    ...Object.fromEntries(['nAccept', 'nSubmit', 'nLike', 'rp', 'rpdelta', 'rank', 'level', 'join'].map((i) => ([
        i, Schema.number().default(0).extra('family', 'setting_storage').disabled().hidden(),
    ]))),

}));

const ignoreUA = [
    'bingbot',
    'Gatus',
    'Googlebot',
    'Prometheus',
    'Uptime',
    'YandexBot',
].join('\n');

// This is a showcase of how to use Schema to define settings.
SystemSetting(Schema.object({
    smtp: Schema.object({
        user: Schema.string().default('').description('SMTP Username'),
        pass: Schema.string().default('').description('SMTP Password').role('password'),
        host: Schema.string().default('').description('SMTP Server Host'),
        port: Schema.number().step(1).min(1).max(65535).default(465).description('SMTP Server Port'),
        from: Schema.string().default('').description('Mail From'),
        secure: Schema.boolean().default(false).description('SSL'),
        verify: Schema.boolean().default(true).description('Verify register email'),
    }).extra('family', 'setting_smtp'),
    server: Schema.object({
        center: Schema.string().default('https://hydro.ac/center').description('Server Center').role('url').hidden(),
        name: Schema.string().default('Hydro').description('Server Name'),
        url: Schema.string().default('/').description('Server BaseURL'),
        upload: Schema.string().default('256m').description('Max upload file size'),
        cdn: Schema.string().default('/').description('CDN Prefix'),
        ws: Schema.string().default('/').description('WebSocket Prefix'),
        host: Schema.string().default('127.0.0.1').description('Listen host'),
        port: Schema.number().step(1).min(1).max(65535).default(8888).description('Server Port'),
        xff: Schema.string().default('').description('IP Header'),
        xhost: Schema.string().default('').description('Hostname Header'),
        xproxy: Schema.boolean().default(false).description('Use reverse_proxy'),
        cors: Schema.string().default('').description('CORS domains'),
        login: Schema.boolean().default(true).description('Allow builtin-login').hidden(),
        checkUpdate: Schema.boolean().default(true).description('Daily update check'),
        ignoreUA: Schema.string().default(ignoreUA).description('ignoredUA').role('textarea'),
    }).extra('family', 'setting_server'),
}));
// We will keep the old settings as-is until new setting ui is ready.
SystemSetting(
    Setting('setting_server', 'server.language', 'zh_CN', langRange, 'server.language', 'Default display language'),
    ServerLangSettingNode,
    Setting('setting_limits', 'limit.by_user', false, 'boolean', 'limit.by_user', 'Use per-user limits instead of per ip limits'),
    Setting('setting_limits', 'limit.problem_files_max', 100, 'number', 'limit.problem_files_max', 'Max files per problem'),
    Setting('setting_limits', 'limit.problem_files_max_size', 256 * 1024 * 1024, 'number', 'limit.problem_files_max_size', 'Max files size per problem'),
    Setting('setting_limits', 'limit.user_files', 100, 'number', 'limit.user_files', 'Max files for user'),
    Setting('setting_limits', 'limit.user_files_size', 128 * 1024 * 1024, 'number', 'limit.user_files_size', 'Max total file size for user'),
    Setting('setting_limits', 'limit.contest_files', 100, 'number', 'limit.contest_files', 'Max files for contest or training'),
    Setting('setting_limits', 'limit.contest_files_size', 128 * 1024 * 1024, 'number', 'limit.contest_files_size', 'Max total file size for contest or training'),
    Setting('setting_limits', 'limit.submission', 60, 'number', 'limit.submission', 'Max submission count per minute'),
    Setting('setting_limits', 'limit.submission_user', 15, 'number', 'limit.submission_user', 'Max submission count per user per minute'),
    Setting('setting_limits', 'limit.pretest', 60, 'number', 'limit.pretest', 'Max pretest count per minute'),
    Setting('setting_limits', 'limit.codelength', 128 * 1024, 'number', 'limit.codelength', 'Max code length'),
    Setting('setting_basic', 'avatar.gravatar_url', '//cn.gravatar.com/avatar/', 'text', 'avatar.gravatar_url', 'Gravatar URL Prefix'),
    Setting('setting_basic', 'default.priv', builtin.PRIV.PRIV_DEFAULT, 'number', 'default.priv', 'Default Privilege', FLAG_HIDDEN),
    Setting('setting_basic', 'discussion.nodes', builtin.DEFAULT_NODES, 'yaml', 'discussion.nodes', 'Discussion Nodes'),
    Setting('setting_basic', 'problem.categories', builtin.CATEGORIES, 'yaml', 'problem.categories', 'Problem Categories'),
    Setting('setting_basic', 'training.enrolled-users', true, 'boolean', 'training.enrolled-users', 'Show enrolled users for training'),
    Setting('setting_basic', 'record.statMode', 'unique', 'text', 'record.statMode', 'Record stat mode'),
    Setting('setting_basic', 'pagination.problem', 100, 'number', 'pagination.problem', 'Problems per page'),
    Setting('setting_basic', 'pagination.contest', 20, 'number', 'pagination.contest', 'Contests per page'),
    Setting('setting_basic', 'pagination.discussion', 50, 'number', 'pagination.discussion', 'Discussions per page'),
    Setting('setting_basic', 'pagination.record', 100, 'number', 'pagination.record', 'Records per page'),
    Setting('setting_basic', 'pagination.ranking', 100, 'number', 'pagination.ranking', 'Users per page'),
    Setting('setting_basic', 'pagination.solution', 20, 'number', 'pagination.solution', 'Solutions per page'),
    Setting('setting_basic', 'pagination.training', 10, 'number', 'pagination.training', 'Trainings per page'),
    Setting('setting_basic', 'pagination.reply', 50, 'number', 'pagination.reply', 'Replies per page'),
    Setting('setting_basic', 'hydrooj.homepage', settingFile.homepage.default, 'yaml', 'hydrooj.homepage', 'Homepage config'),
    Setting('setting_basic', 'hydrooj.langs', settingFile.langs.default, 'yaml', 'hydrooj.langs', 'Language config'),
    Setting('setting_session', 'session.keys', [randomstring(32)], 'text', 'session.keys', 'session.keys', FLAG_HIDDEN),
    Setting('setting_session', 'session.domain', '', 'text', 'session.domain', 'session.domain', FLAG_HIDDEN),
    Setting('setting_session', 'session.saved_expire_seconds', 3600 * 24 * 30,
        'number', 'session.saved_expire_seconds', 'Saved session expire seconds'),
    Setting('setting_session', 'session.unsaved_expire_seconds', 3600 * 3,
        'number', 'session.unsaved_expire_seconds', 'Unsaved session expire seconds'),
    Setting('setting_storage', 'db.ver', 0, 'number', 'db.ver', 'Database version', FLAG_DISABLED | FLAG_HIDDEN),
    Setting('setting_storage', 'installid', randomstring(64), 'text', 'installid', 'Installation ID', FLAG_HIDDEN | FLAG_DISABLED),
);

export const langs: Record<string, LangConfig> = {};

export const inject = ['db'];
export async function apply(ctx: Context) {
    logger.info('Ensuring settings');
    for (const lang in global.Hydro.locales) {
        if (!global.Hydro.locales[lang].__interface) continue;
        langRange[lang] = global.Hydro.locales[lang].__langname;
    }
    const system = global.Hydro.model.system;
    for (const setting of SYSTEM_SETTINGS) {
        if (!setting.value) continue;
        const current = await ctx.db.collection('system').findOne({ _id: setting.key });
        if (!current || current.value == null || current.value === '') {
            await retry(system.set, setting.key, setting.value);
        }
    }
    try {
        Object.assign(langs, parseLang(system.get('hydrooj.langs')));
        const range = {};
        for (const key in langs) range[key] = langs[key].display;
        LangSettingNode.range = range;
        ServerLangSettingNode.range = range;
    } catch (e) { /* Ignore */ }
    ctx.on('system/setting', (args) => {
        if (!args.hydrooj?.langs) return;
        Object.assign(langs, parseLang(args.hydrooj.langs));
        const range = {};
        for (const key in langs) range[key] = langs[key].display;
        LangSettingNode.range = range;
        ServerLangSettingNode.range = range;
    });
}

global.Hydro.model.setting = {
    apply,
    inject,

    Setting,
    PreferenceSetting,
    AccountSetting,
    DomainSetting,
    DomainUserSetting,
    SystemSetting,
    FLAG_HIDDEN,
    FLAG_DISABLED,
    FLAG_SECRET,
    FLAG_PRO,
    PREFERENCE_SETTINGS,
    ACCOUNT_SETTINGS,
    SETTINGS,
    SETTINGS_BY_KEY,
    SYSTEM_SETTINGS,
    SYSTEM_SETTINGS_BY_KEY,
    DOMAIN_SETTINGS,
    DOMAIN_SETTINGS_BY_KEY,
    DOMAIN_USER_SETTINGS,
    DOMAIN_USER_SETTINGS_BY_KEY,
    langs,
};
