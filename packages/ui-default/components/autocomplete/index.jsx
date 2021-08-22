import React from 'react';
import ReactDOM from 'react-dom';
import { assign } from 'lodash';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';
import AutoCompleteFC from './components/AutoComplete';

export default class AutoComplete extends DOMAttachedObject {
  static DOMAttachKey = 'ucwAutoCompleteInstance';

  constructor($dom, options = {}) {
    super($dom);
    this.options = {
      items: async () => [],
      render: () => '',
      text: () => null,
      multi: false,
      ...options,
    };
    this.ref = null;
    this.attach();
  }

  clear(clearValue = true) {
    if (!this.ref) return;
    if (clearValue) this.ref.clear();
    else this.ref.closeList();
  }

  attach() {
    this._name = this.$dom.attr('name');
    this.container = document.createElement('div');
    const width = `${this.$dom.width()}px`;
    const value = this.$dom.val();
    this.$dom.removeAttr('name').css('display', 'none').after(this.container);
    ReactDOM.render(
      <AutoCompleteFC
        ref={(ref) => { this.ref = ref; }}
        name={this._name}
        width={width}
        height="34px"
        itemsFn={this.options.items}
        renderItem={this.options.render}
        itemText={this.options.text}
        defaultItems={value}
        multi={this.options.multi}
      />,
      this.container,
    );
  }

  open() {
    if (!this.ref) return;
    this.ref.triggerQuery();
  }

  close() {
    if (!this.ref) return;
    this.ref.closeList();
  }

  detach() {
    if (this.detached) return;
    super.detach();
    ReactDOM.unmountComponentAtNode(this.container);
    this.$dom.attr('name', this._name).css('display', '');
    this.container.parentNode.removeChild(this.container);
  }

  focus() {
    this.ref.focus();
  }
}

assign(AutoComplete, DOMAttachedObject);
window.Hydro.components.autocomplete = AutoComplete;
