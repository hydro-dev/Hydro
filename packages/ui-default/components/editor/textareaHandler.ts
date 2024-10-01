import DOMAttachedObject from 'vj/components/DOMAttachedObject';
import Editor from './index';

export default class TextareaHandler extends DOMAttachedObject {
  static DOMAttachKey = 'vjTextareaHandlerInstance';

  getCmEditor() {
    return Editor.get(this.$dom);
  }

  isCmEditor() {
    const editor = this.getCmEditor();
    return !!(editor && editor.isValid);
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
