import _ from 'lodash';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';
import CmEditor from '.';

export default class TextareaHandler extends DOMAttachedObject {
  static DOMAttachKey = 'vjTextareaHandlerInstance';

  getCmEditor() {
    return CmEditor.get(this.$dom);
  }

  isCmEditor() {
    const editor = this.getCmEditor();
    return (editor !== undefined && editor.isValid());
  }

  val(...argv) {
    if (this.isCmEditor()) {
      return this.getCmEditor().value(...argv);
    }
    return this.$dom.val(...argv);
  }

  focus() {
    if (this.isCmEditor()) {
      this.getCmEditor().focus();
    }
    this.$dom.focus();
  }
}

_.assign(TextareaHandler, DOMAttachedObject);
