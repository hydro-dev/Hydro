import AutoComplete from '.';
import ProblemSelectAutoCompleteFC from './components/ProblemSelectAutoComplete';

export default class ProblemSelectAutoComplete extends AutoComplete {
  static DOMAttachKey = 'ucwProblemSelectAutoCompleteInstance';

  constructor($dom, options) {
    super($dom, {
      classes: 'problem-select',
      component: ProblemSelectAutoCompleteFC,
      props: {
        multi: options.multi,
        height: 'auto',
      },
      ...options,
    });
  }
}

window.Hydro.components.ProblemSelectAutoComplete = ProblemSelectAutoComplete;
