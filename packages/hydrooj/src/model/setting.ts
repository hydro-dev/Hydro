/* eslint-disable no-await-in-loop */
import moment from 'moment-timezone';
import { Dictionary } from 'lodash';
import * as builtin from './builtin';
import { Setting as _Setting } from '../interface';

type SettingDict = Dictionary<_Setting>;

const countries = moment.tz.countries();
const tzs = new Set();
for (const country of countries) {
    const tz = moment.tz.zonesForCountry(country);
    for (const t of tz) tzs.add(t);
}
const timezones = Array.from(tzs).sort().map((tz) => [tz, tz]) as [string, string][];
export const langRange: Dictionary<string> = {};

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

export type SettingType = 'text' | 'number' | 'markdown' | 'password' | 'select' | 'boolean' | 'textarea';

export const Setting = (
    family: string, key: string, range: Array<[string, string]> | Dictionary<string> = null,
    value: any = null, type: SettingType = 'text', name = '',
    desc = '', flag = 0,
): _Setting => ({
    family, key, range, value, type, name, desc, flag,
});

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
    Setting('setting_display', 'viewLang', langRange, 'zh_CN', 'select', 'UI Language'),
    Setting('setting_display', 'timeZone', timezones, 'Asia/Shanghai', 'select', 'Timezone'),
    Setting('setting_usage', 'codeLang', builtin.LANG_TEXTS, 'c', 'select', 'Default Code Language'),
    Setting('setting_usage', 'codeTemplate', null, '', 'textarea', 'Default Code Template',
        'If left blank, the built-in template of the corresponding language will be used.'),
);

AccountSetting(
    Setting('setting_info', 'gravatar', null, null, 'text', 'Gravatar Email',
        'We use <a href="https://en.gravatar.com/" target="_blank">Gravatar</a> to present your avatar icon.'),
    Setting('setting_info', 'qq', null, null, 'text', 'QQ'),
    Setting('setting_info', 'gender', builtin.USER_GENDER_RANGE, builtin.USER_GENDER_OTHER, 'select', 'Gender'),
    Setting('setting_info', 'bio', null, null, 'markdown', 'Bio'),
    Setting('setting_customize', 'backgroundImage', null,
        '/components/profile/backgrounds/1.jpg', 'text', 'Profile Background Image',
        'Choose the background image in your profile page.'),
    Setting('setting_storage', 'usage', null, 0, 'number', 'Userfile Usage', null, FLAG_DISABLED | FLAG_HIDDEN),
);

DomainSetting(
    Setting('setting_domain', 'name', null, 'New domain', 'text', 'name'),
    Setting('setting_domain', 'gravatar', null, '', 'text', 'gravatar', 'Will be used as the domain icon.'),
    Setting('setting_domain', 'bulletin', null, '', 'markdown', 'Bulletin'),
    Setting('setting_storage', 'pidCounter', null, 0, 'number', 'Problem ID Counter', null, FLAG_HIDDEN | FLAG_DISABLED),
);

DomainUserSetting(
    Setting('setting_info', 'displayName', null, null, 'text', 'display name'),
    Setting('setting_storage', 'nAccept', null, 0, 'number', 'nAccept', null, FLAG_HIDDEN | FLAG_DISABLED),
    Setting('setting_storage', 'nSubmit', null, 0, 'number', 'nSubmit', null, FLAG_HIDDEN | FLAG_DISABLED),
    Setting('setting_storage', 'nLike', null, 0, 'number', 'nLike', null, FLAG_HIDDEN | FLAG_DISABLED),
    Setting('setting_storage', 'rp', null, 1500, 'number', 'RP', null, FLAG_HIDDEN | FLAG_DISABLED),
    Setting('setting_storage', 'level', null, 0, 'number', 'level', null, FLAG_HIDDEN | FLAG_DISABLED),
);

SystemSetting(
    Setting('setting_smtp', 'smtp.user', null, null, 'text', 'SMTP Username'),
    Setting('setting_smtp', 'smtp.pass', null, null, 'password', 'SMTP Password', null, FLAG_SECRET),
    Setting('setting_smtp', 'smtp.host', null, null, 'text', 'SMTP Server Host'),
    Setting('setting_smtp', 'smtp.port', null, 465, 'number', 'SMTP Server Port'),
    Setting('setting_smtp', 'smtp.from', null, null, 'text', 'Mail From'),
    Setting('setting_smtp', 'smtp.secure', null, false, 'boolean', 'SSL'),
    Setting('setting_server', 'server.name', null, 'Hydro', 'text', 'Server Name'),
    Setting('setting_server', 'server.worker', null, 1, 'number', 'Server Workers Number'),
    Setting('setting_server', 'server.hostname', null, null, 'text', 'Server Hostname'),
    Setting('setting_server', 'server.host', null, null, 'text', 'Server Host'),
    Setting('setting_server', 'server.url', null, null, 'text', 'Server BaseURL'),
    Setting('setting_server', 'server.cdn', null, '/', 'text', 'CDN Prefix', 'Ends with /'),
    Setting('setting_server', 'server.port', null, 8888, 'number', 'Server Port'),
    Setting('setting_server', 'server.xff', null, null, 'text', 'IP Header', 'e.g. x-forwarded-for (lowercase)'),
    Setting('setting_session', 'session.keys', null, [String.random(32)], 'text', 'session.keys', null, FLAG_HIDDEN),
    Setting('setting_session', 'session.secure', null, false, 'boolean', 'session.secure'),
    Setting('setting_session', 'session.saved_expire_seconds', null, 3600 * 24 * 30, 'number', 'Saved session expire seconds'),
    Setting('setting_session', 'session.unsaved_expire_seconds', null, 3600 * 3, 'number', 'Unsaved session expire seconds'),
    Setting('setting_storage', 'db.ver', null, 1, 'number', 'Database version', null, FLAG_DISABLED | FLAG_HIDDEN),
    Setting('setting_storage', 'user', null, 1, 'number', 'User Counter', null, FLAG_DISABLED | FLAG_HIDDEN),
);

global.Hydro.postInit.push(
    async () => {
        for (const setting of SYSTEM_SETTINGS) {
            if (setting.value) {
                const current = await global.Hydro.model.system.get(setting.key);
                if (current === null || current === '') {
                    await global.Hydro.model.system.set(setting.key, setting.value);
                }
            }
        }
    },
);

global.Hydro.model.setting = {
    langRange,
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
