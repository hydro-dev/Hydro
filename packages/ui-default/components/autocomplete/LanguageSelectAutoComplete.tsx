import React from 'react';
import AutoComplete from '.';
import LanguageSelectAutoCompleteFC from './components/LanguageSelectAutoComplete';

const Component = React.forwardRef<any, any>((props, ref) => {
  const [value, setValue] = React.useState(props.value ?? '');
  return (
    <LanguageSelectAutoCompleteFC
      ref={ref as any}
      height="auto"
      selectedKeys={value.split(',').map((i) => i.trim()).filter((i) => i)}
      onChange={(v) => {
        setValue(v);
        props.onChange(v);
      }}
      multi={props.multi}
      allowEmptyQuery={true}
    />
  );
});

export default class LanguageSelectAutoComplete extends AutoComplete {
  static DOMAttachKey = 'ucwLanguageSelectAutoCompleteInstance';

  constructor($dom, options) {
    super($dom, {
      classes: 'language-select',
      ...options,
    });
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

window.Hydro.components.LanguageSelectAutoComplete = LanguageSelectAutoComplete;
