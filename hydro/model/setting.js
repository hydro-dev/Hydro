const builtin = require('./builtin');
const options = require('../options');
const i18n = require('../lib/i18n');

const Setting = (
    family, key, range = null,
    value = null, ui = 'text', name = '',
    desc = '', imageClass = '',
) => ({
    family, key, range, value, ui, name, desc, imageClass,
});

const PREFERENCE_SETTINGS = [
    Setting('setting_display', 'viewLang', i18n,
        options.default_locale, 'select', 'UI Language'),
    Setting('setting_display', 'timezone', [], // TODO(masnn) timezone
        'Asia/Shanghai', 'select', 'Timezone'),
    Setting('setting_usage', 'codeLang', builtin.LANG_TEXTS,
        null, 'select', 'Default Code Language'),
    Setting('setting_usage', 'codeTemplate', null,
        null, 'textarea', 'Default Code Template',
        'If left blank, the built-in template of the corresponding language will be used.'),
];

const ACCOUNT_SETTINGS = [
    Setting('setting_info', 'gravatar', null,
        null, 'text', 'Gravatar Email',
        'We use <a href="https://en.gravatar.com/" target="_blank">Gravatar</a> to present your avatar icon.'),
    Setting('setting_info', 'qq', null,
        null, 'text', 'QQ'),
    Setting('setting_info', 'gender', builtin.USER_GENDER_RANGE,
        null, 'select', 'Gender'),
    Setting('setting_info', 'bio', null,
        null, 'markdown', 'Bio'),
    Setting('setting_customize', 'background_img', builtin.BACKGROUND_RANGE,
        null, 'image_radio', 'Profile Background Image',
        'Choose the background image in your profile page.',
        'user-profile-bg--thumbnail-{0}'),
];

const SETTINGS = [...PREFERENCE_SETTINGS, ...ACCOUNT_SETTINGS];
const SETTINGS_BY_KEY = {};

for (const setting in SETTINGS) SETTINGS_BY_KEY[setting.key] = setting;

const SYSTEM_SETTINGS = [
    Setting('setting_smtp', 'smtp.user', null, null, 'text', 'SMTP Username'),
    Setting('setting_smtp', 'smtp.pass', null, null, 'password', 'SMTP Password'),
    Setting('setting_smtp', 'smtp.host', null, null, 'text', 'SMTP Server Host'),
    Setting('setting_smtp', 'smtp.port', null, 465, 'text', 'SMTP Server Port'),
    Setting('setting_smtp', 'smtp.from', null, null, 'text', 'Mail From'),
    Setting('setting_smtp', 'smtp.secure', null, false, 'checkbox', 'SSL'),
    Setting('setting_server', 'listen.port', null, 8888, 'text', 'Server Port', ''),
    Setting('setting_constant', 'PROBLEM_PER_PAGE', null, 100, 'text', 'Problems per Page'),
    Setting('setting_constant', 'CONTEST_PER_PAGE', null, 20, 'text', 'Contests per Page'),
    Setting('setting_constant', 'DISCUSSION_PER_PAGE', null, 50, 'text', 'Discussion per Page'),
    Setting('setting_constant', 'RECORD_PER_PAGE', null, 100, 'text', 'Record per Page'),
    Setting('setting_constant', 'SOLUTION_PER_PAGE', null, 20, 'text', 'Solutions per Page'),
    Setting('setting_constant', 'TRAINING_PER_PAGE', null, 10, 'text', 'Training per Page'),
    Setting('setting_constant', 'REPLY_PER_PAGE', null, 50, 'text', 'Reply per Page'),
];

global.Hydro.model.setting = module.exports = {
    Setting, PREFERENCE_SETTINGS, ACCOUNT_SETTINGS, SETTINGS, SETTINGS_BY_KEY, SYSTEM_SETTINGS,
};
