import React from 'react';
import AutoComplete, { AutoCompleteOptions } from '.';
import UserSelectAutoCompleteFC from './components/UserSelectAutoComplete';

const Component = React.forwardRef<any, any>((props, ref) => {
  const [value, setValue] = React.useState(props.value ?? '');
  return (
    <UserSelectAutoCompleteFC
      ref={ref as any}
      height="auto"
      selectedKeys={value.split(',').map((i) => i.trim()).filter((i) => i)}
      onChange={(v) => {
        setValue(v);
        props.onChange(v);
      }}
      multi={props.multi}
    />
  );
});

export default class UserSelectAutoComplete<Multi extends boolean> extends AutoComplete {
  static DOMAttachKey = 'ucwUserSelectAutoCompleteInstance';

  constructor($dom, options: AutoCompleteOptions<Multi>) {
    super($dom, {
      classes: 'user-select',
      ...options,
    });
  }

  value(): Multi extends true ? number[] : string {
    if (this.options.multi) return this.ref?.getSelectedItemKeys().map((i) => +i) ?? this.$dom.val();
    return this.ref?.getSelectedItems()[0] ?? null;
  }

  attach() {
    const value = this.$dom.val();
    this.component.render(
      <Component
        ref={(ref) => { this.ref = ref; }}
        value={value}
        multi={this.options.multi}
        onChange={this.onChange}
      />,
    );
  }
}

window.Hydro.components.UserSelectAutoComplete = UserSelectAutoComplete;
