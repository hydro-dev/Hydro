import AutoComplete, { AutoCompleteOptions } from '.';
import LanguageSelectAutoCompleteFC from './components/LanguageSelectAutoComplete';

interface LanguageSelectOptions {
  multi?: boolean;
  withAuto?: boolean;
}

export default class LanguageSelectAutoComplete<Multi extends boolean> extends AutoComplete<LanguageSelectOptions> {
  static DOMAttachKey = 'ucwLanguageSelectAutoCompleteInstance';

  constructor($dom, options: LanguageSelectOptions & AutoCompleteOptions<Multi>) {
    super($dom, {
      classes: 'language-select',
      component: LanguageSelectAutoCompleteFC,
      props: {
        multi: options.multi,
        withAuto: options.withAuto,
        height: 'auto',
      },
      ...options,
    });
  }
}

window.Hydro.components.LanguageSelectAutoComplete = LanguageSelectAutoComplete;
