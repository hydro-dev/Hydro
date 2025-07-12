import LanguageSelectAutoComplete from 'vj/components/autocomplete/LanguageSelectAutoComplete';
import { NamedPage } from 'vj/misc/Page';

const page = new NamedPage('domain_edit', () => {
  LanguageSelectAutoComplete.getOrConstruct($('[name=langs]'), { multi: true });
});

export default page;
