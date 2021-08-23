import React from 'react';
import ReactDOM from 'react-dom';
import { assign } from 'lodash';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';
import AutoComplete from '.';
import DomainSelectAutoCompleteFC from './components/DomainSelectAutoComplete';

export default class DomainSelectAutoComplete extends AutoComplete {
  static DOMAttachKey = 'ucwDomainSelectAutoCompleteInstance';

  constructor($dom, options) {
    super($dom, {
      classes: 'domain-select',
      ...options,
    });
  }

  attach() {
    const value = this.$dom.val();
    ReactDOM.render(
      <DomainSelectAutoCompleteFC
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

assign(DomainSelectAutoComplete, DOMAttachedObject);
window.Hydro.components.DomainSelectAutoComplete = DomainSelectAutoComplete;
