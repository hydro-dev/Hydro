import AutoComplete, { AutoCompleteOptions } from '.';
import UserSelectAutoCompleteFC from './components/UserSelectAutoComplete';

export default class UserSelectAutoComplete<Multi extends boolean> extends AutoComplete {
  static DOMAttachKey = 'ucwUserSelectAutoCompleteInstance';

  constructor($dom, options: AutoCompleteOptions<Multi> = {}) {
    super($dom, {
      classes: 'user-select',
      component: UserSelectAutoCompleteFC,
      props: {
        multi: options.multi,
        height: 'auto',
      },
      ...options,
    });
  }

  value(): Multi extends true ? number[] : string {
    if (this.options.multi) return this.ref?.getSelectedItemKeys().map((i) => +i) ?? this.$dom.val();
    return this.ref?.getSelectedItems()[0] ?? null;
  }
}

window.Hydro.components.UserSelectAutoComplete = UserSelectAutoComplete;
