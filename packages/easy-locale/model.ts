import yaml from 'js-yaml';
import * as bus from 'hydrooj/src/service/bus';
import * as system from 'hydrooj/src/model/system';
import i18n from 'hydrooj/src/lib/i18n';

bus.once('app/started', () => {
    const langs = system.get('easy-locale.langs');
    const entries = yaml.load(langs);
    i18n(entries as any);
});
