import React from 'react';
import ReactDOM from 'react-dom';
import { assign } from 'lodash';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';
import AutoComplete from '.';
import ProblemSelectAutoCompleteFC from './components/ProblemSelectAutoComplete';

const Component = React.forwardRef<any, any>((props, ref) => {
  const [value, setValue] = React.useState(props.value);
  return (
    <ProblemSelectAutoCompleteFC
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

export default class ProblemSelectAutoComplete extends AutoComplete {
  static DOMAttachKey = 'ucwProblemSelectAutoCompleteInstance';

  constructor($dom, options) {
    super($dom, {
      classes: 'problem-select',
      ...options,
    });
  }

  attach() {
    const value = this.$dom.val();
    ReactDOM.render(
      <Component
        ref={(ref) => { this.ref = ref; }}
        value={value}
        multi={this.options.multi}
        onChange={this.onChange}
      />,
      this.container,
    );
  }
}

assign(ProblemSelectAutoComplete, DOMAttachedObject);
window.Hydro.components.ProblemSelectAutoComplete = ProblemSelectAutoComplete;
