import React from 'react';
import ReactDOM from 'react-dom/client';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';
import AutoCompleteFC from './components/AutoComplete';

export interface AutoCompleteOptions<Multi extends boolean = boolean> {
  multi?: Multi;
  defaultItems?: string;
  width?: string;
  height?: string;
  classes?: string;
  listStyle?: any;
  allowEmptyQuery?: boolean;
  freeSolo?: boolean;
  freeSoloConverter?: any;
  onChange?: (value) => any;
  items?: () => Promise<any[]>;
  render?: () => string;
  text?: () => string;
}

export default class AutoComplete<Options extends Record<string, any> = {}> extends DOMAttachedObject {
  static DOMAttachKey = 'ucwAutoCompleteInstance';
  ref = null;
  container = document.createElement('div');
  options: AutoCompleteOptions & Options;
  component = ReactDOM.createRoot(this.container);
  changeListener = [
    (val) => this.$dom.val(val),
  ];

  constructor($dom, options = {} as Options) {
    super($dom);
    this.options = {
      items: async () => [],
      render: () => '',
      text: () => null,
      multi: false,
      ...options,
    };
    this.clear = this.clear.bind(this);
    this.onChange = this.onChange.bind(this);
    this.attach = this.attach.bind(this);
    this.open = this.open.bind(this);
    this.close = this.close.bind(this);
    this.value = this.value.bind(this);
    this.detach = this.detach.bind(this);
    this.focus = this.focus.bind(this);
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

  onChange(val: string | ((v: string) => any)) {
    if (typeof val === 'string') this.changeListener.forEach((f) => f(val));
    else this.changeListener.push(val);
  }

  attach() {
    const value = this.$dom.val();
    this.component.render(
      <AutoCompleteFC
        ref={(ref) => { this.ref = ref; }}
        height="34px"
        queryItems={this.options.items}
        renderItem={this.options.render}
        itemText={this.options.text}
        selectedKeys={value.split(',').map((i) => i.trim())}
        onChange={this.onChange}
        multi={this.options.multi}
        freeSolo={this.options.multi}
      />,
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

  value(): any {
    if (this.options.multi) return this.$dom.val();
    return this.ref?.getSelectedItems()[0] ?? null;
  }

  detach() {
    if (this.detached) return;
    super.detach();
    this.component.unmount();
    this.$dom.removeClass('autocomplete-dummy');
    this.container.parentNode.removeChild(this.container);
  }

  focus() {
    this.ref.focus();
  }
}

window.Hydro.components.autocomplete = AutoComplete;
