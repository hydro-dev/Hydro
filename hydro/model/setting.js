const moment = require('moment-timezone');
const builtin = require('./builtin');

const countries = moment.tz.countries();
const tzs = new Set();
for (const country of countries) {
    const tz = moment.tz.zonesForCountry(country);
    for (const t of tz) tzs.add(t);
}
const timezones = Array.from(tzs).sort().map((tz) => [tz, tz]);

const PREFERENCE_SETTINGS = [];
const ACCOUNT_SETTINGS = [];
const DOMAIN_SETTINGS = [];
const DOMAIN_USER_SETTINGS = [];
const SYSTEM_SETTINGS = [];
const SETTINGS = [];
const SETTINGS_BY_KEY = {};
const DOMAIN_USER_SETTINGS_BY_KEY = {};
const DOMAIN_SETTINGS_BY_KEY = {};
const SYSTEM_SETTINGS_BY_KEY = {};

const Setting = (
    family, key, range = null,
    value = null, ui = 'text', name = '',
    desc = '', hidden = false,
) => ({
    family, key, range, value, ui, name, desc, hidden,
});

const PreferenceSetting = (...settings) => {
    for (const setting of settings) {
        PREFERENCE_SETTINGS.push(setting);
        SETTINGS.push(setting);
        SETTINGS_BY_KEY[setting.key] = setting;
    }
};
const AccountSetting = (...settings) => {
    for (const setting of settings) {
        ACCOUNT_SETTINGS.push(setting);
        SETTINGS.push(setting);
        SETTINGS_BY_KEY[setting.key] = setting;
    }
};
const DomainUserSetting = (...settings) => {
    for (const setting of settings) {
        DOMAIN_USER_SETTINGS.push(setting);
        DOMAIN_USER_SETTINGS_BY_KEY[setting.key] = setting;
    }
};
const DomainSetting = (...settings) => {
    for (const setting of settings) {
        DOMAIN_SETTINGS.push(setting);
        DOMAIN_SETTINGS_BY_KEY[setting.key] = setting;
    }
};
const SystemSetting = (...settings) => {
    for (const setting of settings) {
        SYSTEM_SETTINGS.push(setting);
        SYSTEM_SETTINGS_BY_KEY[setting.key] = setting;
    }
};

PreferenceSetting(
    // TODO generate by global.Hydro.locales
    Setting('setting_display', 'viewLang', builtin.VIEW_LANGS.map((i) => [i.code, i.name]),
        'zh_CN', 'select', 'UI Language'),
    Setting('setting_display', 'timezone', timezones,
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
);

SystemSetting(
    Setting('setting_smtp', 'smtp.user', null, null, 'text', 'SMTP Username'),
    Setting('setting_smtp', 'smtp.pass', null, null, 'password', 'SMTP Password'),
    Setting('setting_smtp', 'smtp.host', null, null, 'text', 'SMTP Server Host'),
    Setting('setting_smtp', 'smtp.port', null, 465, 'number', 'SMTP Server Port'),
    Setting('setting_smtp', 'smtp.from', null, null, 'text', 'Mail From'),
    Setting('setting_smtp', 'smtp.secure', null, false, 'checkbox', 'SSL'),
    Setting('setting_server', 'server.worker', null, 1, 'number', 'Server Workers Number'),
    Setting('setting_server', 'server.hostname', null, null, 'text', 'Server Hostname'),
    Setting('setting_server', 'server.host', null, null, 'text', 'Server Host'),
    Setting('setting_server', 'server.url', null, null, 'text', 'Server BaseURL'),
    Setting('setting_server', 'server.port', null, 8888, 'number', 'Server Port'),
    Setting('setting_server', 'server.log', null, false, 'checkbox', 'Disable Access Log'),
    Setting('setting_oauth', 'oauth.githubappid', null, null, 'text', 'Github Oauth AppID'),
    Setting('setting_oauth', 'oauth.githubsecret', null, null, 'text', 'Github Oauth Secret'),
    Setting('setting_oauth', 'oauth.googleappid', null, null, 'text', 'Google Oauth ClientID'),
    Setting('setting_oauth', 'oauth.googlesecret', null, null, 'text', 'Google Oauth Secret'),
    Setting('setting_proxy', 'proxy', null, null, 'text', 'Proxy Server URL'),
    Setting('setting_constant', 'PROBLEM_PER_PAGE', null, 100, 'number', 'Problems per Page'),
    Setting('setting_constant', 'CONTEST_PER_PAGE', null, 20, 'number', 'Contests per Page'),
    Setting('setting_constant', 'DISCUSSION_PER_PAGE', null, 50, 'number', 'Discussion per Page'),
    Setting('setting_constant', 'RECORD_PER_PAGE', null, 100, 'number', 'Record per Page'),
    Setting('setting_constant', 'SOLUTION_PER_PAGE', null, 20, 'number', 'Solutions per Page'),
    Setting('setting_constant', 'TRAINING_PER_PAGE', null, 10, 'number', 'Training per Page'),
    Setting('setting_constant', 'REPLY_PER_PAGE', null, 50, 'number', 'Reply per Page'),
);

global.Hydro.model.setting = module.exports = {
    Setting,
    PreferenceSetting,
    AccountSetting,
    DomainSetting,
    DomainUserSetting,
    SystemSetting,
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
