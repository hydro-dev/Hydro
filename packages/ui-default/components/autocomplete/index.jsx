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
    this.clear = this.clear.bind(this);
    this.onChange = this.onChange.bind(this);
    this.attach = this.attach.bind(this);
    this.open = this.open.bind(this);
    this.close = this.close.bind(this);
    this.value = this.value.bind(this);
    this.detach = this.detach.bind(this);
    this.focus = this.focus.bind(this);
    this.container = document.createElement('div');
    this.$dom.addClass('autocomplete-dummy').after(this.container);
    // Note: use `setTimeout(fn, 0)` to ensure that code is executed after browser autofill
    // also see https://stackoverflow.com/a/779785/13553984
    setTimeout(() => this.attach(), 0);
  }

  clear(clearValue = true) {
    if (!this.ref) return;
    if (clearValue) this.ref.clear();
    else this.ref.closeList();
  }

  onChange(val) {
    this.$dom.val(val);
  }

  attach() {
    const value = this.$dom.val();
    ReactDOM.render(
      <AutoCompleteFC
        ref={(ref) => { this.ref = ref; }}
        height="34px"
        itemsFn={this.options.items}
        renderItem={this.options.render}
        itemText={this.options.text}
        defaultItems={value}
        onChange={this.onChange}
        multi={this.options.multi}
        freeSolo={this.options.multi}
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

  value() {
    if (this.options.multi) return this.$dom.val();
    return this.ref?.getSelectedItems()[0] ?? null;
  }

  detach() {
    if (this.detached) return;
    super.detach();
    ReactDOM.unmountComponentAtNode(this.container);
    this.$dom.removeClass('autocomplete-dummy');
    this.container.parentNode.removeChild(this.container);
  }

  focus() {
    this.ref.focus();
  }
}

assign(AutoComplete, DOMAttachedObject);
window.Hydro.components.autocomplete = AutoComplete;
