import _ from 'lodash';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';

export const config = {
  toolbar: [
    'emoji', 'headings', 'bold', 'italic', 'strike', 'link', '|',
    'list', 'ordered-list', 'check', 'outdent', 'indent', '|',
    'quote', 'line', 'code', 'inline-code', 'table', '|',
    'upload', 'edit-mode', 'content-theme', 'code-theme', 'export',
  ],
  mode: UserContext.preferedEditorType || 'ir',
  toolbarConfig: {
    pin: true,
  },
  cdn: `${UiContext.cdn_prefix}vditor`,
  counter: {
    enable: true,
    max: 65536,
  },
  preview: {
    math: {
      inlineDigit: true,
    },
  },
};

export default class CmEditor extends DOMAttachedObject {
  static DOMAttachKey = 'vjCmEditorInstance';

  constructor($dom, options = {}) {
    super($dom);
    this.options = options;
    this.init();
  }

  async init() {
    const { default: Vditor } = await import('vditor');
    const { $dom } = this;
    const hasFocus = $dom.is(':focus');
    const origin = $dom.get(0);
    const ele = document.createElement('div');
    const value = $dom.val();
    await new Promise((resolve) => {
      this.editor = new Vditor(ele, {
        ...config,
        ...this.options,
        after: resolve,
        input(v) { $dom.val(v); $dom.text(v); },
        value,
        cache: { id: Math.random().toString() },
      });
    });
    $(ele).addClass('textbox');
    $dom.hide();
    origin.parentElement.appendChild(ele);
    this.isValid = true;
    if (hasFocus) this.focus();
  }

  ensureValid() {
    if (!this.isValid) throw new Error('Editor is not loaded');
  }

  value(val) {
    this.ensureValid();
    if (val) return this.editor.setValue(val);
    return this.editor.getValue();
  }

  focus() {
    this.ensureValid();
    this.editor.focus();
  }
}

_.assign(CmEditor, DOMAttachedObject);
