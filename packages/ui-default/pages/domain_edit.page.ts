import CustomSelectAutoComplete from 'vj/components/autocomplete/CustomSelectAutoComplete';
import { NamedPage } from 'vj/misc/Page';
import i18n from 'vj/utils/i18n';

const page = new NamedPage('domain_edit', () => {
  const prefixes = new Set(Object.keys(window.LANGS).filter((i) => i.includes('.')).map((i) => i.split('.')[0]));
  const langs = [
    { key: '_', name: i18n('objective') },
    ...Object.keys(window.LANGS).filter((i) => !prefixes.has(i)).map((i) => ({ name: window.LANGS[i].display, _id: i })),
  ];
  CustomSelectAutoComplete.getOrConstruct($('[name="langs"]'), { multi: true, data: langs });
});

export default page;
