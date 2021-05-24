import yaml from 'js-yaml';
import * as bus from 'hydrooj/dist/service/bus';
import * as system from 'hydrooj/dist/model/system';
import i18n from 'hydrooj/dist/lib/i18n';

bus.once('app/started', () => {
    const langs = system.get('easy-locale.langs');
    const entries = yaml.load(langs);
    i18n(entries as any);
});
