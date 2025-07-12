import AutoComplete, { AutoCompleteOptions } from '.';
import DomainSelectAutoCompleteFC from './components/DomainSelectAutoComplete';

export default class DomainSelectAutoComplete<Multi extends boolean> extends AutoComplete {
  static DOMAttachKey = 'ucwDomainSelectAutoCompleteInstance';

  constructor($dom, options: AutoCompleteOptions<Multi> = {}) {
    super($dom, {
      classes: 'domain-select',
      component: DomainSelectAutoCompleteFC,
      props: {
        multi: options.multi,
        height: '34px',
      },
      ...options,
    });
  }
}

window.Hydro.components.DomainSelectAutoComplete = DomainSelectAutoComplete;
