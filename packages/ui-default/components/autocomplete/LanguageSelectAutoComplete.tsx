import React from 'react';
import AutoComplete, { AutoCompleteOptions } from '.';
import LanguageSelectAutoCompleteFC from './components/LanguageSelectAutoComplete';

interface LanguageSelectOptions {
  multi?: boolean;
  withAuto?: boolean;
}

const Component = React.forwardRef<any, any>((props, ref) => {
  const [value, setValue] = React.useState(props.value);
  return (
    <LanguageSelectAutoCompleteFC
      ref={ref as any}
      height="auto"
      selectedKeys={(Array.isArray(value) ? value : value.split(',')).map((i) => i.trim()).filter((i) => i)}
      onChange={(v) => {
        setValue(v);
        props.onChange(v.join(','));
      }}
      multi={props.multi}
      withAuto={props.withAuto}
    />
  );
});

export default class LanguageSelectAutoComplete<Multi extends boolean> extends AutoComplete<LanguageSelectOptions> {
  static DOMAttachKey = 'ucwLanguageSelectAutoCompleteInstance';

  constructor($dom, options: LanguageSelectOptions & AutoCompleteOptions<Multi>) {
    super($dom, {
      classes: 'language-select',
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
        withAuto={this.options.withAuto}
        onChange={this.onChange}
      />,
    );
  }
}

window.Hydro.components.LanguageSelectAutoComplete = LanguageSelectAutoComplete;
