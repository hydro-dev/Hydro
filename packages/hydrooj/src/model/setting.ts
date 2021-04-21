/* eslint-disable no-await-in-loop */
import moment from 'moment-timezone';
import { Dictionary } from 'lodash';
import yaml from 'js-yaml';
import { retry } from '@hydrooj/utils/lib/utils';
import * as builtin from './builtin';
import { Setting as _Setting } from '../interface';
import { Logger } from '../logger';
import * as bus from '../service/bus';

type SettingDict = Dictionary<_Setting>;

const logger = new Logger('model/setting');
const countries = moment.tz.countries();
const tzs = new Set();
for (const country of countries) {
    const tz = moment.tz.zonesForCountry(country);
    for (const t of tz) tzs.add(t);
}
const timezones = Array.from(tzs).sort().map((tz) => [tz, tz]) as [string, string][];
const langRange: Dictionary<string> = {};

for (const lang in global.Hydro.locales) {
    langRange[lang] = global.Hydro.locales[lang].__langname;
}

export const FLAG_HIDDEN = 1;
export const FLAG_DISABLED = 2;
export const FLAG_SECRET = 4;

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

// eslint-disable-next-line max-len
export type SettingType = 'text' | 'yaml' | 'number' | 'markdown' | 'password' | 'boolean' | 'textarea' | [string, string][] | Record<string, string>;

export const Setting = (
    family: string, key: string, value: any = null,
    type: SettingType = 'text', name = '', desc = '', flag = 0,
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
    };
};

export const PreferenceSetting = (...settings: _Setting[]) => {
    for (const setting of settings) {
        PREFERENCE_SETTINGS.push(setting);
        SETTINGS.push(setting);
        SETTINGS_BY_KEY[setting.key] = setting;
    }
};
export const AccountSetting = (...settings: _Setting[]) => {
    for (const setting of settings) {
        ACCOUNT_SETTINGS.push(setting);
        SETTINGS.push(setting);
        SETTINGS_BY_KEY[setting.key] = setting;
    }
};
export const DomainUserSetting = (...settings: _Setting[]) => {
    for (const setting of settings) {
        DOMAIN_USER_SETTINGS.push(setting);
        DOMAIN_USER_SETTINGS_BY_KEY[setting.key] = setting;
    }
};
export const DomainSetting = (...settings: _Setting[]) => {
    for (const setting of settings) {
        DOMAIN_SETTINGS.push(setting);
        DOMAIN_SETTINGS_BY_KEY[setting.key] = setting;
    }
};
export const SystemSetting = (...settings: _Setting[]) => {
    for (const setting of settings) {
        SYSTEM_SETTINGS.push(setting);
        SYSTEM_SETTINGS_BY_KEY[setting.key] = setting;
    }
};

PreferenceSetting(
    Setting('setting_display', 'viewLang', null, langRange, 'UI Language'),
    Setting('setting_display', 'timeZone', 'Asia/Shanghai', timezones, 'Timezone'),
    Setting('setting_usage', 'codeLang', 'c', builtin.LANG_TEXTS, 'Default Code Language'),
    Setting('setting_usage', 'codeTemplate', '', 'textarea', 'Default Code Template',
        'If left blank, the built-in template of the corresponding language will be used.'),
);

AccountSetting(
    Setting('setting_info', 'avatar', '', 'text', 'Avatar',
        'Allow using gravatar:email qq:id github:name format.'),
    Setting('setting_info', 'qq', null, 'text', 'QQ'),
    Setting('setting_info', 'gender', builtin.USER_GENDER_OTHER, builtin.USER_GENDER_RANGE, 'Gender'),
    Setting('setting_info', 'bio', null, 'markdown', 'Bio'),
    Setting('setting_customize', 'backgroundImage',
        '/components/profile/backgrounds/1.jpg', 'text', 'Profile Background Image',
        'Choose the background image in your profile page.'),
    Setting('setting_storage', 'unreadMsg', 0, 'number', 'Unread Message Count', null, FLAG_DISABLED | FLAG_HIDDEN),
    Setting('setting_storage', 'checkincnt', 0, 'number', 'Check In Counter', null, FLAG_DISABLED | FLAG_HIDDEN),
    Setting('setting_storage', 'lastcheckin', 0, 'number', 'Last checkin time', null, FLAG_DISABLED | FLAG_HIDDEN),
);

DomainSetting(
    Setting('setting_domain', 'name', 'New domain', 'text', 'name'),
    Setting('setting_domain', 'avatar', '', 'text', 'avatar', 'Will be used as the domain icon.'),
    Setting('setting_domain', 'bulletin', '', 'markdown', 'Bulletin'),
    Setting('setting_storage', 'host', '', 'text', 'Custom host', null, FLAG_HIDDEN | FLAG_DISABLED),
);

DomainUserSetting(
    Setting('setting_info', 'displayName', null, 'text', 'Display Name'),
    Setting('setting_storage', 'nAccept', 0, 'number', 'nAccept', null, FLAG_HIDDEN | FLAG_DISABLED),
    Setting('setting_storage', 'nSubmit', 0, 'number', 'nSubmit', null, FLAG_HIDDEN | FLAG_DISABLED),
    Setting('setting_storage', 'nLike', 0, 'number', 'nLike', null, FLAG_HIDDEN | FLAG_DISABLED),
    Setting('setting_storage', 'rp', 1500, 'number', 'RP', null, FLAG_HIDDEN | FLAG_DISABLED),
    Setting('setting_storage', 'rpdelta', 0, 'number', 'RP.delta', null, FLAG_HIDDEN | FLAG_DISABLED),
    Setting('setting_storage', 'level', 0, 'number', 'level', null, FLAG_HIDDEN | FLAG_DISABLED),
);

SystemSetting(
    Setting('setting_file', 'file.endPoint', null, 'text', 'file.endPoint', 'Storage engine endPoint'),
    Setting('setting_file', 'file.accessKey', null, 'text', 'file.accessKey', 'Storage engine accessKey'),
    Setting('setting_file', 'file.secretKey', null, 'password', 'file.secretKey', 'Storage engine secret', FLAG_SECRET),
    Setting('setting_file', 'file.bucket', 'hydro', 'text', 'file.bucket', 'Storage engine bucket'),
    Setting('setting_file', 'file.region', 'us-east-1', 'text', 'file.region', 'Storage engine region'),
    Setting('setting_file', 'file.endPointForUser', '/fs/', 'text', 'file.endPointForUser', 'EndPoint for user'),
    Setting('setting_file', 'file.endPointForJudge', '/fs/', 'text', 'file.endPointForJudge', 'EndPoint for judge'),
    Setting('setting_smtp', 'smtp.user', null, 'text', 'smtp.user', 'SMTP Username'),
    Setting('setting_smtp', 'smtp.pass', null, 'password', 'smtp.pass', 'SMTP Password', FLAG_SECRET),
    Setting('setting_smtp', 'smtp.host', null, 'text', 'smtp.host', 'SMTP Server Host'),
    Setting('setting_smtp', 'smtp.port', 465, 'number', 'smtp.port', 'SMTP Server Port'),
    Setting('setting_smtp', 'smtp.from', null, 'text', 'smtp.from', 'Mail From'),
    Setting('setting_smtp', 'smtp.secure', false, 'boolean', 'smtp.secure', 'SSL'),
    Setting('setting_server', 'server.name', 'Hydro', 'text', 'server.name', 'Server Name'),
    Setting('setting_server', 'server.worker', 1, 'number', 'server.worker', 'Server Workers Number'),
    Setting('setting_server', 'server.hostname', 'oj.undefined.moe', 'text', 'server.hostname', 'Server Hostname'),
    Setting('setting_server', 'server.host', 'oj.undefined.moe', 'text', 'server.host', 'Server Host'),
    Setting('setting_server', 'server.url', '/', 'text', 'server.url', 'Server BaseURL'),
    Setting('setting_server', 'server.cdn', '/', 'text', 'server.cdn', 'CDN Prefix'),
    Setting('setting_server', 'server.port', 8888, 'number', 'server.port', 'Server Port'),
    Setting('setting_server', 'server.xff', null, 'text', 'server.xff', 'IP Header'),
    Setting('setting_server', 'server.xhost', null, 'text', 'server.xhost', 'Hostname Header'),
    Setting('setting_server', 'server.language', 'zh_CN', langRange, 'server.language', 'Default display language'),
    Setting('setting_server', 'server.login', true, 'boolean', 'server.login', 'Allow builtin-login'),
    Setting('setting_basic', 'default.priv', builtin.PRIV.PRIV_DEFAULT, 'number', 'default.priv', 'Default Privilege'),
    Setting('setting_basic', 'problem.categories', builtin.CATEGORIES, 'yaml', 'problem.categories', 'Problem Categories'),
    Setting('setting_basic', 'lang.texts', builtin.LANG_TEXTS, 'yaml', 'lang.texts', 'LANG_TEXTS'),
    Setting('setting_basic', 'pagination.problem', 100, 'number', 'pagination.problem', 'Problems per page'),
    Setting('setting_basic', 'pagination.contest', 20, 'number', 'pagination.contest', 'Contests per page'),
    Setting('setting_basic', 'pagination.discussion', 50, 'number', 'pagination.discussion', 'Discussions per page'),
    Setting('setting_basic', 'pagination.record', 100, 'number', 'pagination.record', 'Records per page'),
    Setting('setting_basic', 'pagination.solution', 20, 'number', 'pagination.solution', 'Solutions per page'),
    Setting('setting_basic', 'pagination.training', 10, 'number', 'pagination.training', 'Trainings per page'),
    Setting('setting_basic', 'pagination.reply', 50, 'number', 'pagination.reply', 'Replies per page'),
    Setting('setting_basic', 'pagination.homework_main', 5, 'number', 'pagination.homework_main', 'Homeworks on main'),
    Setting('setting_basic', 'pagination.contest_main', 10, 'number', 'pagination.contest_main', 'Contests on main'),
    Setting('setting_basic', 'pagination.training_main', 10, 'number', 'pagination.training_main', 'Trainings on main'),
    Setting('setting_basic', 'pagination.discussion_main', 20, 'number', 'pagination.discussion_main', 'Discussions on main'),
    Setting('setting_session', 'session.keys', [String.random(32)], 'text', 'session.keys', 'session.keys', FLAG_HIDDEN),
    Setting('setting_session', 'session.secure', false, 'boolean', 'session.secure', 'session.secure'),
    Setting('setting_session', 'session.saved_expire_seconds', 3600 * 24 * 30,
        'number', 'session.saved_expire_seconds', 'Saved session expire seconds'),
    Setting('setting_session', 'session.unsaved_expire_seconds', 3600 * 3,
        'number', 'session.unsaved_expire_seconds', 'Unsaved session expire seconds'),
    Setting('setting_storage', 'db.ver', 0, 'number', 'db.ver', 'Database version', FLAG_DISABLED | FLAG_HIDDEN),
    Setting('setting_storage', 'installid', String.random(64), 'text', 'installid', 'Installation ID', FLAG_HIDDEN | FLAG_DISABLED),
);

bus.once('app/started', async () => {
    logger.debug('Ensuring settings');
    const system = global.Hydro.model.system;
    for (const setting of SYSTEM_SETTINGS) {
        if (setting.value) {
            const current = await global.Hydro.service.db.collection('system').findOne({ _id: setting.key });
            if (!current || current.value == null || current.value === '') {
                await retry(system.set, setting.key, setting.value);
            }
        }
    }
    try {
        SETTINGS_BY_KEY['codeLang'].range = yaml.load(system.get('lang.texts')) as any;
    } catch (e) { /* Ignore */ }
});

bus.on('system/setting', (args) => {
    if (!args.lang?.texts) return;
    SETTINGS_BY_KEY['codeLang'].range = yaml.load(args.lang.texts) as any;
});

global.Hydro.model.setting = {
    Setting,
    PreferenceSetting,
    AccountSetting,
    DomainSetting,
    DomainUserSetting,
    SystemSetting,
    FLAG_HIDDEN,
    FLAG_DISABLED,
    FLAG_SECRET,
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
};
