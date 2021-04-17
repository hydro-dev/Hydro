import React from 'react';
import Vditor from 'vditor';
import { config } from './index';

export default class MarkdownEditor extends React.PureComponent {
  constructor(props) {
    super(props);
    this.ref = React.createRef();
  }

  async componentDidMount() {
    await new Promise((resolve) => {
      this.editor = new Vditor(this.ref.current, {
        ...config,
        after: resolve,
        input(value) { this.props.onChange(value); },
        cache: { id: Math.random().toString() },
      });
    });
  }

  componentWillUnmount() {
    this.editor.destory();
    this.editor.detach();
  }

  value() {
    return this.editor.getValue();
  }

  focus() {
    return this.editor.focus();
  }

  render() {
    return <div ref={this.ref}></div>;
  }
}
