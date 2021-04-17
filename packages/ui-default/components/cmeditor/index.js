import _ from 'lodash';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';

export const config = {
  toolbar: [
    'emoji', 'headings', 'bold', 'italic', 'strike', 'link', '|',
    'list', 'ordered-list', 'check', 'outdent', 'indent', '|',
    'quote', 'line', 'code', 'inline-code', '|',
    'upload', 'record', 'table', '|',
    'edit-mode', 'content-theme', 'code-theme', 'export', 'preview',
  ],
  mode: 'ir',
  toolbarConfig: {
    pin: true,
  },
  counter: {
    enable: true,
    max: 65536,
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
    const value = $dom.text();
    await new Promise((resolve) => {
      this.editor = new Vditor(ele, {
        ...config,
        after: resolve,
        input(v) { $dom.text(v); },
        value,
        cache: { id: Math.random().toString() },
        upload: {
          accept: 'image/*,.mp3, .wav, .zip',
          url: '/api/upload/editor',
          linkToImgUrl: '/api/upload/fetch',
          filename(name) {
            return name.replace(/[^(a-zA-Z0-9\u4e00-\u9fa5.)]/g, '')
              .replace(/[?\\/:|<>*[\]()$%{}@~]/g, '')
              .replace('/\\s/g', '');
          },
        },
      });
    });
    $(ele).addClass('textbox');
    $dom.hide();
    origin.parentElement.appendChild(ele);
    if (hasFocus) this.focus();
    this.isValid = true;
  }

  ensureValid() {
    if (!this.isValid) throw new Error('Editor is not loaded');
  }

  value(...argv) {
    this.ensureValid();
    const ret = this.editor.value(...argv);
    return ret;
  }

  destory() {
    this.editor.destory();
  }

  focus() {
    this.ensureValid();
    this.editor.focus();
  }
}

_.assign(CmEditor, DOMAttachedObject);
