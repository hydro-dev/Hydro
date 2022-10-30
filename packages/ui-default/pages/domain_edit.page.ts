import CustomSelectAutoComplete from 'vj/components/autocomplete/CustomSelectAutoComplete';
import { NamedPage } from 'vj/misc/Page';
import i18n from 'vj/utils/i18n';

const page = new NamedPage('domain_edit', () => {
  const langs = [
    { key: '_', name: i18n('objective') },
    ...Object.keys(window.LANGS).map((i) => ({ key: i, name: window.LANGS[i].display })),
  ];
  CustomSelectAutoComplete.getOrConstruct($('[name="langs"]'), { multi: true, data: langs });
});

export default page;
