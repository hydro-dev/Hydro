import React from 'react';
import ReactDOM from 'react-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { assign } from 'lodash';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';
import AutoComplete, { AutoCompleteOptions } from '.';
import UserSelectAutoCompleteFC from './components/UserSelectAutoComplete';

export default class UserSelectAutoComplete<Multi extends boolean> extends AutoComplete {
  static DOMAttachKey = 'ucwUserSelectAutoCompleteInstance';
  client = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
        retry: false,
        staleTime: Infinity,
      },
    },
  });

  constructor($dom, options: AutoCompleteOptions<Multi>) {
    super($dom, {
      classes: 'user-select',
      ...options,
    });
  }

  value(): Multi extends true ? number[] : string {
    if (this.options.multi) return this.ref?.getSelectedItems().map((item) => item._id) ?? this.$dom.val();
    return this.ref?.getSelectedItems()[0] ?? null;
  }

  attach() {
    const value = this.$dom.val();
    ReactDOM.render(
      <QueryClientProvider client={this.client}>
        <UserSelectAutoCompleteFC
          ref={(ref) => { this.ref = ref; }}
          height={this.options.height || "34px"}
          defaultItems={value}
          onChange={this.onChange}
          multi={this.options.multi}
          freeSolo={this.options.multi}
        />
      </QueryClientProvider>,
      this.container,
    );
  }
}

assign(UserSelectAutoComplete, DOMAttachedObject);
window.Hydro.components.UserSelectAutoComplete = UserSelectAutoComplete;
