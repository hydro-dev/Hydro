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
    this._name = this.$dom.attr('name');
    this.container = document.createElement('div');
    const width = `${this.$dom.width()}px`;
    const value = this.$dom.val();
    this.$dom.removeAttr('name').css('display', 'none').after(this.container);
    ReactDOM.render(
      <ProblemSelectAutoCompleteFC
        ref={(ref) => { this.ref = ref; }}
        name={this._name}
        width={width}
        height="34px"
        defaultItems={value}
        multi={this.options.multi}
      />,
      this.container,
    );
  }
}

assign(ProblemSelectAutoComplete, DOMAttachedObject);
window.Hydro.components.ProblemSelectAutoComplete = ProblemSelectAutoComplete;
