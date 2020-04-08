import _ from 'lodash';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';

export default class CmEditor extends DOMAttachedObject {
  static DOMAttachKey = 'vjCmEditorInstance';

  constructor($dom, options = {}) {
    super($dom);
    this.editor = null;
    this.options = options;
    this.init();
  }

  async init() {
    const { default: VjCmEditor } = await import('./vjcmeditor');

    const hasFocus = this.$dom.is(':focus');
    const srcHeight = this.$dom.outerHeight();

    this.editor = new VjCmEditor({
      ...this.options,
      element: this.$dom.get(0),
    });
    this.moveToEnd();

    const $editor = $(this.editor.wrapper);
    $editor.css('height', srcHeight);
    $editor.addClass('toolbar--visible');

    if (hasFocus) {
      this.focus();
    }
  }

  isValid() {
    return (this.editor !== null);
  }

  ensureValid() {
    if (!this.isValid()) {
      throw new Error('VjCmEditor is not loaded');
    }
  }

  value(...argv) {
    this.ensureValid();
    const ret = this.editor.value(...argv);
    if (argv.length > 0) {
      this.moveToEnd();
    }
    return ret;
  }

  focus() {
    this.ensureValid();
    this.editor.codemirror.focus();
  }

  moveToEnd() {
    this.ensureValid();
    const cm = this.editor.codemirror;
    cm.setCursor(cm.lineCount(), 0);
  }
}

_.assign(CmEditor, DOMAttachedObject);
