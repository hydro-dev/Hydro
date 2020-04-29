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
    Setting('setting_display', 'view_lang', i18n,
        options.default_locale, 'select', 'UI Language'),
    Setting('setting_display', 'timezone', [], // TODO(masnn) timezone
        'Asia/Shanghai', 'select', 'Timezone'),
    Setting('setting_usage', 'code_lang', builtin.LANG_TEXTS,
        null, 'select', 'Default Code Language'),
    Setting('setting_usage', 'code_template', null,
        null, 'textarea', 'Default Code Template',
        'If left blank, the built-in template of the corresponding language will be used.'),
];

const ACCOUNT_SETTINGS = [
    Setting('setting_info', 'gravatar', null,
        null, null, 'Gravatar Email',
        'We use <a href="https://en.gravatar.com/" target="_blank">Gravatar</a> to present your avatar icon.'),
    Setting('setting_info', 'qq', null,
        null, null, 'QQ'),
    Setting('setting_info', 'wechat', null,
        null, null, 'WeChat'),
    Setting('setting_info', 'gender', builtin.USER_GENDER_RANGE,
        null, 'select', 'Gender'),
    Setting('setting_info', 'bio', null,
        null, 'markdown', 'Bio'),
    Setting('setting_privacy', 'show_mail', builtin.PRIVACY_RANGE,
        null, 'select', 'Email Visibility'),
    Setting('setting_privacy', 'show_qq', builtin.PRIVACY_RANGE,
        null, 'select', 'QQ Visibility'),
    Setting('setting_privacy', 'show_wechat', builtin.PRIVACY_RANGE,
        null, 'select', 'WeChat Visibility'),
    Setting('setting_privacy', 'show_gender', builtin.PRIVACY_RANGE,
        null, 'select', 'Gender Visibility'),
    Setting('setting_privacy', 'show_bio', builtin.PRIVACY_RANGE,
        null, 'select', 'Bio Visibility'),
    Setting('setting_customize', 'background_img', builtin.BACKGROUND_RANGE,
        null, 'image_radio', 'Profile Background Image',
        'Choose the background image in your profile page.',
        'user-profile-bg--thumbnail-{0}'),
];

const SETTINGS = [...PREFERENCE_SETTINGS, ...ACCOUNT_SETTINGS];
const SETTINGS_BY_KEY = {};

for (const setting in SETTINGS) SETTINGS_BY_KEY[setting.key] = setting;

module.exports = {
    PREFERENCE_SETTINGS, ACCOUNT_SETTINGS, SETTINGS, SETTINGS_BY_KEY,
};
