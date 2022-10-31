import CustomSelectAutoComplete from 'vj/components/autocomplete/CustomSelectAutoComplete';
import { NamedPage } from 'vj/misc/Page';
import i18n from 'vj/utils/i18n';

const page = new NamedPage('domain_edit', () => {
  const langs = [
    { key: '_', name: i18n('objective') },
    ...Object.keys(window.LANGS).map((i) => (
      { name: `${i.includes('.') ? `${window.LANGS[i.split('.')[0]].display}/` : ''}${window.LANGS[i].display}`, _id: i }
    )),
  ];
  CustomSelectAutoComplete.getOrConstruct($('[name=langs]'), { multi: true, data: langs });
});

export default page;
