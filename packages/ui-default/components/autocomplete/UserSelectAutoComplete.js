import React from 'react';
import ReactDOM from 'react-dom';
import { assign } from 'lodash';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';
import AutoComplete from '.';
import UserSelectAutoCompleteFC from './components/UserSelectAutoComplete';

export default class UserSelectAutoComplete extends AutoComplete {
  static DOMAttachKey = 'ucwUserSelectAutoCompleteInstance';

  constructor($dom, options) {
    super($dom, {
      classes: 'user-select',
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
      <UserSelectAutoCompleteFC
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

assign(UserSelectAutoComplete, DOMAttachedObject);
window.Hydro.components.UserSelectAutoComplete = UserSelectAutoComplete;
