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
    const value = this.$dom.val();
    ReactDOM.render(
      <UserSelectAutoCompleteFC
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

assign(UserSelectAutoComplete, DOMAttachedObject);
window.Hydro.components.UserSelectAutoComplete = UserSelectAutoComplete;
