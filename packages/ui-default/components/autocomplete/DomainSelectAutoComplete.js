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
    this._name = this.$dom.attr('name');
    this.container = document.createElement('div');
    const width = this.$dom.width();
    const value = this.$dom.val();
    this.$dom.removeAttr('name').css('display', 'none').after(this.container);
    ReactDOM.render(
      <DomainSelectAutoCompleteFC
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

assign(DomainSelectAutoComplete, DOMAttachedObject);
window.Hydro.components.DomainSelectAutoComplete = DomainSelectAutoComplete;
