import moment from 'moment-timezone';
import * as builtin from './builtin';
import { Setting as _Setting } from '../interface';

const countries = moment.tz.countries();
const tzs: Set<string> = new Set();
for (const country of countries) {
    const tz = moment.tz.zonesForCountry(country);
    for (const t of tz) tzs.add(t);
}
const timezones = Array.from(tzs).sort().map((tz) => [tz, tz]);

export const FLAG_HIDDEN = 1;
export const FLAG_DISABLED = 2;
export const FLAG_SECRET = 4;

export const PREFERENCE_SETTINGS = [];
export const ACCOUNT_SETTINGS = [];
export const DOMAIN_SETTINGS = [];
export const DOMAIN_USER_SETTINGS = [];
export const SYSTEM_SETTINGS = [];
export const SETTINGS = [];
export const SETTINGS_BY_KEY = {};
export const DOMAIN_USER_SETTINGS_BY_KEY = {};
export const DOMAIN_SETTINGS_BY_KEY = {};
export const SYSTEM_SETTINGS_BY_KEY = {};

export const Setting = (
    family: string, key: string, range: Array<[string, string]> | { [key: string]: string } = null,
    value: any = null, type = 'text', name = '',
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
    // TODO generate by global.Hydro.locales
    Setting('setting_display', 'viewLang', builtin.VIEW_LANGS.map((i) => [i.code, i.name]),
        'zh_CN', 'select', 'UI Language'),
    Setting('setting_display', 'timezone', timezones as [string, string][],
        'Asia/Shanghai', 'select', 'Timezone'),
    Setting('setting_usage', 'codeLang', builtin.LANG_TEXTS,
        null, 'select', 'Default Code Language'),
    Setting('setting_usage', 'codeTemplate', null,
        null, 'textarea', 'Default Code Template',
        'If left blank, the built-in template of the corresponding language will be used.'),
);

AccountSetting(
    Setting('setting_info', 'gravatar', null,
        null, 'text', 'Gravatar Email',
        'We use <a href="https://en.gravatar.com/" target="_blank">Gravatar</a> to present your avatar icon.'),
    Setting('setting_info', 'qq', null,
        null, 'text', 'QQ'),
    Setting('setting_info', 'gender', builtin.USER_GENDER_RANGE,
        null, 'select', 'Gender'),
    Setting('setting_info', 'bio', null,
        null, 'markdown', 'Bio'),
    Setting('setting_customize', 'backgroundImage', null,
        '/components/profile/backgrounds/1.jpg', 'text', 'Profile Background Image',
        'Choose the background image in your profile page.'),
);

DomainSetting(
    Setting('setting_domain', 'name', null, 'New domain', 'text', 'name'),
    Setting('setting_domain', 'gravatar', null, '', 'text', 'gravatar', 'Will be used as the domain icon.'),
    Setting('setting_domain', 'bulletin', null, '', 'markdown', 'Bulletin'),
    Setting('storage', 'nAccept', null, 0, 'number', 'nAccept', null, FLAG_HIDDEN & FLAG_DISABLED),
    Setting('storage', 'nSubmit', null, 0, 'number', 'nSubmit', null, FLAG_HIDDEN & FLAG_DISABLED),
    Setting('storage', 'nLike', null, 0, 'number', 'nLike', null, FLAG_HIDDEN & FLAG_DISABLED),
    Setting('storage', 'rating', null, 1500, 'number', 'rating', null, FLAG_HIDDEN & FLAG_DISABLED),
);

SystemSetting(
    Setting('setting_smtp', 'smtp.user', null, null, 'text', 'SMTP Username'),
    Setting('setting_smtp', 'smtp.pass', null, null, 'password', 'SMTP Password', null, FLAG_SECRET),
    Setting('setting_smtp', 'smtp.host', null, null, 'text', 'SMTP Server Host'),
    Setting('setting_smtp', 'smtp.port', null, 465, 'number', 'SMTP Server Port'),
    Setting('setting_smtp', 'smtp.from', null, null, 'text', 'Mail From'),
    Setting('setting_smtp', 'smtp.secure', null, false, 'boolean', 'SSL'),
    Setting('setting_server', 'server.worker', null, 1, 'number', 'Server Workers Number'),
    Setting('setting_server', 'server.hostname', null, null, 'text', 'Server Hostname'),
    Setting('setting_server', 'server.host', null, null, 'text', 'Server Host'),
    Setting('setting_server', 'server.url', null, null, 'text', 'Server BaseURL'),
    Setting('setting_server', 'server.port', null, 8888, 'number', 'Server Port'),
    Setting('setting_server', 'server.xff', null, null, 'text', 'IP Header'),
    Setting('setting_server', 'server.log', null, false, 'boolean', 'Disable Access Log'),
    Setting('setting_ui', 'ui.header', null, null, 'text', 'Header Logo'),
    Setting('setting_ui', 'ui.headerBackground', null, null, 'text', 'Header Background'),
    Setting('setting_ui', 'ui.nav', null, null, 'text', 'Nav Logo'),
    Setting('setting_oauth', 'oauth.githubappid', null, null, 'text', 'Github Oauth AppID'),
    Setting('setting_oauth', 'oauth.githubsecret', null, null, 'text', 'Github Oauth Secret', null, FLAG_SECRET),
    Setting('setting_oauth', 'oauth.googleappid', null, null, 'text', 'Google Oauth ClientID', null),
    Setting('setting_oauth', 'oauth.googlesecret', null, null, 'text', 'Google Oauth Secret', null, FLAG_SECRET),
    Setting('setting_proxy', 'proxy', null, null, 'text', 'Proxy Server URL'),
    Setting('setting_constant', 'PROBLEM_PER_PAGE', null, 100, 'number', 'Problems per Page'),
    Setting('setting_constant', 'CONTEST_PER_PAGE', null, 20, 'number', 'Contests per Page'),
    Setting('setting_constant', 'DISCUSSION_PER_PAGE', null, 50, 'number', 'Discussion per Page'),
    Setting('setting_constant', 'RECORD_PER_PAGE', null, 100, 'number', 'Record per Page'),
    Setting('setting_constant', 'SOLUTION_PER_PAGE', null, 20, 'number', 'Solutions per Page'),
    Setting('setting_constant', 'TRAINING_PER_PAGE', null, 10, 'number', 'Training per Page'),
    Setting('setting_constant', 'REPLY_PER_PAGE', null, 50, 'number', 'Reply per Page'),
);

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
