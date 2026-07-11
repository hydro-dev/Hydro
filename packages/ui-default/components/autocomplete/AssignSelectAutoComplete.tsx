import AutoComplete, { AutoCompleteOptions } from '.';
import AssignSelectAutoCompleteFC from './components/AssignSelectAutoComplete';

export default class AssignSelectAutoComplete<Multi extends boolean> extends AutoComplete {
  static DOMAttachKey = 'ucwAssignSelectAutoCompleteInstance';

  constructor($dom, options: AutoCompleteOptions<Multi> = {}) {
    super($dom, {
      classes: 'assign-select',
      component: AssignSelectAutoCompleteFC,
      props: {
        multi: true,
        height: 'auto',
      },
      ...options,
    });
  }

  value(): string {
    return this.ref?.getSelectedItemKeys().join(',') ?? this.$dom.val();
  }
}
