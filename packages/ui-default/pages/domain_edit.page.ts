import CustomSelectAutoComplete from 'vj/components/autocomplete/CustomSelectAutoComplete';
import { NamedPage } from 'vj/misc/Page';

const page = new NamedPage('domain_edit', () => {
  const langs = [
    { key: '_', name: '客观题' },
    ...Object.keys(window.LANGS).map((i) => ({ key: i, name: window.LANGS[i].display })),
  ];
  CustomSelectAutoComplete.getOrConstruct($('[name="langs"]'), { multi: true, data: langs });
});

export default page;
