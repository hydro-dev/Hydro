/* eslint-disable no-await-in-loop */
import moment from 'moment-timezone';
import { Dictionary } from 'lodash';
import yaml from 'js-yaml';
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

export type SettingType = 'text' | 'yaml' | 'number' | 'markdown' | 'password' | 'boolean' | 'textarea' | [string, string][] | Record<string, string>;

export const Setting = (
    family: string, key: string, value: any = null,
    type: SettingType = 'text', name = '', desc = '', flag = 0,
): _Setting => {
    if (type === 'yaml' && typeof value !== 'string') {
        value = yaml.dump(value);
        type = 'textarea';
    }
    return {
        family,
        key,
        value,
        name,
        desc,
        flag,
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
    Setting('setting_info', 'gravatar', null, 'text', 'Gravatar Email',
        'We use <a href="https://en.gravatar.com/" target="_blank">Gravatar</a> to present your avatar icon.'),
    Setting('setting_info', 'qq', null, 'text', 'QQ'),
    Setting('setting_info', 'gender', builtin.USER_GENDER_OTHER, builtin.USER_GENDER_RANGE, 'Gender'),
    Setting('setting_info', 'bio', null, 'markdown', 'Bio'),
    Setting('setting_customize', 'backgroundImage',
        '/components/profile/backgrounds/1.jpg', 'text', 'Profile Background Image',
        'Choose the background image in your profile page.'),
    Setting('setting_storage', 'usage', 0, 'number', 'Userfile Usage', null, FLAG_DISABLED | FLAG_HIDDEN),
    Setting('setting_storage', 'checkincnt', 0, 'number', 'Check In Counter', null, FLAG_DISABLED | FLAG_HIDDEN),
    Setting('setting_storage', 'lastcheckin', 0, 'number', 'Last checkin time', null, FLAG_DISABLED | FLAG_HIDDEN),
);

DomainSetting(
    Setting('setting_domain', 'name', 'New domain', 'text', 'name'),
    Setting('setting_domain', 'gravatar', '', 'text', 'gravatar', 'Will be used as the domain icon.'),
    Setting('setting_domain', 'bulletin', '', 'markdown', 'Bulletin'),
    Setting('setting_storage', 'pidCounter', 0, 'number', 'Problem ID Counter', null, FLAG_HIDDEN | FLAG_DISABLED),
    Setting('setting_storage', 'host', '', 'text', 'Custom host', null, FLAG_HIDDEN | FLAG_DISABLED),
);

DomainUserSetting(
    Setting('setting_info', 'displayName', null, 'text', 'display name'),
    Setting('setting_storage', 'nAccept', 0, 'number', 'nAccept', null, FLAG_HIDDEN | FLAG_DISABLED),
    Setting('setting_storage', 'nSubmit', 0, 'number', 'nSubmit', null, FLAG_HIDDEN | FLAG_DISABLED),
    Setting('setting_storage', 'nLike', 0, 'number', 'nLike', null, FLAG_HIDDEN | FLAG_DISABLED),
    Setting('setting_storage', 'rp', 1500, 'number', 'RP', null, FLAG_HIDDEN | FLAG_DISABLED),
    Setting('setting_storage', 'rpdelta', 0, 'number', 'RP.delta', null, FLAG_HIDDEN | FLAG_DISABLED),
    Setting('setting_storage', 'level', 0, 'number', 'level', null, FLAG_HIDDEN | FLAG_DISABLED),
);

SystemSetting(
    Setting('setting_file', 'file.endPoint', null, 'text', 'Storage engine endPoint'),
    Setting('setting_file', 'file.accessKey', null, 'text', 'Storage engine accessKey'),
    Setting('setting_file', 'file.secretKey', null, 'password', 'Storage engine secret', null, FLAG_SECRET),
    Setting('setting_file', 'file.bucket', 'hydro', 'text', 'Storage engine bucket'),
    Setting('setting_file', 'file.region', 'us-east-1', 'text', 'Storage engine region'),
    Setting('setting_file', 'file.endPointForUser', '/fs/', 'text', 'EndPoint for user'),
    Setting('setting_file', 'file.endPointForJudge', '/fs/', 'text', 'EndPoint for judge'),
    Setting('setting_smtp', 'smtp.user', null, 'text', 'SMTP Username'),
    Setting('setting_smtp', 'smtp.pass', null, 'password', 'SMTP Password', null, FLAG_SECRET),
    Setting('setting_smtp', 'smtp.host', null, 'text', 'SMTP Server Host'),
    Setting('setting_smtp', 'smtp.port', 465, 'number', 'SMTP Server Port'),
    Setting('setting_smtp', 'smtp.from', null, 'text', 'Mail From'),
    Setting('setting_smtp', 'smtp.secure', false, 'boolean', 'SSL'),
    Setting('setting_server', 'server.name', 'Hydro', 'text', 'Server Name'),
    Setting('setting_server', 'server.worker', 1, 'number', 'Server Workers Number'),
    Setting('setting_server', 'server.hostname', 'oj.undefined.moe', 'text', 'Server Hostname'),
    Setting('setting_server', 'server.host', 'oj.undefined.moe', 'text', 'Server Host'),
    Setting('setting_server', 'server.url', '/', 'text', 'Server BaseURL'),
    Setting('setting_server', 'server.cdn', '/', 'text', 'CDN Prefix', 'Ends with /'),
    Setting('setting_server', 'server.port', 8888, 'number', 'Server Port'),
    Setting('setting_server', 'server.xff', null, 'text', 'IP Header', 'e.g. x-forwarded-for (lowercase)'),
    Setting('setting_server', 'server.language', 'zh_CN', langRange, 'Default display language'),
    Setting('setting_basic', 'problem.categories', builtin.CATEGORIES, 'yaml', 'Problem Categories'),
    Setting('setting_basic', 'lang.texts', builtin.LANG_TEXTS, 'yaml', 'LANG_TEXTS'),
    Setting('setting_basic', 'pagination.problem', 100, 'number', 'Problems per page'),
    Setting('setting_basic', 'pagination.contest', 20, 'number', 'Contests per page'),
    Setting('setting_basic', 'pagination.discussion', 50, 'number', 'Discussions per page'),
    Setting('setting_basic', 'pagination.record', 100, 'number', 'Records per page'),
    Setting('setting_basic', 'pagination.solution', 20, 'number', 'Solutions per page'),
    Setting('setting_basic', 'pagination.training', 10, 'number', 'Trainings per page'),
    Setting('setting_basic', 'pagination.reply', 50, 'number', 'Replies per page'),
    Setting('setting_basic', 'pagination.homework_main', 5, 'number', 'Homeworks on main'),
    Setting('setting_basic', 'pagination.contest_main', 10, 'number', 'Contests on main'),
    Setting('setting_basic', 'pagination.training_main', 10, 'number', 'Trainings on main'),
    Setting('setting_basic', 'pagination.discussion_main', 20, 'number', 'Discussions on main'),
    Setting('setting_session', 'session.keys', [String.random(32)], 'text', 'session.keys', null, FLAG_HIDDEN),
    Setting('setting_session', 'session.secure', false, 'boolean', 'session.secure'),
    Setting('setting_session', 'session.saved_expire_seconds', 3600 * 24 * 30, 'number', 'Saved session expire seconds'),
    Setting('setting_session', 'session.unsaved_expire_seconds', 3600 * 3, 'number', 'Unsaved session expire seconds'),
    Setting('setting_storage', 'db.ver', 0, 'number', 'Database version', null, FLAG_DISABLED | FLAG_HIDDEN),
    Setting('setting_storage', 'user', 1, 'number', 'User Counter', null, FLAG_DISABLED | FLAG_HIDDEN),
    Setting('setting_storage', 'installid', String.random(64), 'text', 'Installation ID', null, FLAG_HIDDEN | FLAG_DISABLED),
);

bus.once('app/started', async () => {
    logger.debug('Ensuring settings');
    for (const setting of SYSTEM_SETTINGS) {
        if (setting.value) {
            const current = await global.Hydro.service.db.collection('system').findOne({ _id: setting.key });
            if (!current || current.value == null || current.value === '') {
                // @ts-ignore
                await global.Hydro.model.system.set(setting.key, setting.value);
            }
        }
    }
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
