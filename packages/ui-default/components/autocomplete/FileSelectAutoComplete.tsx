import React from 'react';
import ReactDOM from 'react-dom/client';
import AutoComplete, { AutoCompleteOptions } from '.';
import FileSelectAutoCompleteFC from './components/FileSelectAutoComplete';

interface FileSelectOptions {
  data: {
    id: string;
    name: string;
  }[];
}

const Component = React.forwardRef<any, any>((props, ref) => {
  const [value, setValue] = React.useState(props.value);
  return (
    <FileSelectAutoCompleteFC
      ref={ref as any}
      height="auto"
      selectedKeys={value.split(',').map((i) => i.trim()).filter((i) => i)}
      onChange={(v) => {
        setValue(v);
        props.onChange(v);
      }}
      data={props.data}
      multi={props.multi}
    />
  );
});

export default class FileSelectAutoComplete<Multi extends boolean> extends AutoComplete<FileSelectOptions> {
  static DOMAttachKey = 'ucwFileSelectAutoCompleteInstance';

  constructor($dom, options: FileSelectOptions & AutoCompleteOptions<Multi>) {
    super($dom, {
      classes: 'custom-select',
      ...options,
    });
  }

  value(): Multi extends true ? number[] : string {
    if (this.options.multi) return this.ref?.getSelectedItemKeys().map((i) => +i) ?? this.$dom.val();
    return this.ref?.getSelectedItems()[0] ?? null;
  }

  attach() {
    const value = this.$dom.val();
    ReactDOM.createRoot(this.container).render(
      <Component
        ref={(ref) => { this.ref = ref; }}
        data={this.options.data}
        value={value}
        multi={this.options.multi}
        onChange={this.onChange}
      />,
    );
  }
}

window.Hydro.components.FileSelectAutoComplete = FileSelectAutoComplete;
