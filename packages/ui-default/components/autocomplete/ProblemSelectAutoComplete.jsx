import React from 'react';
import ReactDOM from 'react-dom';
import { assign } from 'lodash';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';
import AutoComplete from '.';
import ProblemSelectAutoCompleteFC from './components/ProblemSelectAutoComplete';

export default class ProblemSelectAutoComplete extends AutoComplete {
  static DOMAttachKey = 'ucwProblemSelectAutoCompleteInstance';

  constructor($dom, options) {
    super($dom, {
      classes: 'problem-select',
      ...options,
    });
  }

  attach() {
    const value = this.$dom.val();
    ReactDOM.render(
      <ProblemSelectAutoCompleteFC
        ref={(ref) => { this.ref = ref; }}
        height="34px"
        defaultItems={value}
        onChange={this.onChange}
        multi={this.options.multi}
        freeSolo={this.options.multi}
      />,
      this.container,
    );
  }
}

assign(ProblemSelectAutoComplete, DOMAttachedObject);
window.Hydro.components.ProblemSelectAutoComplete = ProblemSelectAutoComplete;
