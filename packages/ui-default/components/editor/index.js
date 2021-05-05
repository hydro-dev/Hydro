import _ from 'lodash';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';

export const config = {
  toolbar: [
    'emoji', 'headings', 'bold', 'italic', 'strike', 'link', '|',
    'list', 'ordered-list', 'check', 'outdent', 'indent', '|',
    'quote', 'line', 'code', 'inline-code', 'table', '|',
    'upload', 'edit-mode', 'fullscreen', 'export',
  ],
  mode: UserContext.preferredEditorType || 'ir',
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

export default class Editor extends DOMAttachedObject {
  static DOMAttachKey = 'vjEditorInstance';

  constructor($dom, options = {}) {
    super($dom);
    this.options = options;
    if (UserContext.preferredEditorType === 'monaco') this.initMonaco();
    else this.initVditor();
  }

  async initMonaco() {
    const monaco = await import('monaco-editor/esm/vs/editor/editor.api');
    const { $dom } = this;
    const hasFocus = $dom.is(':focus');
    const origin = $dom.get(0);
    const ele = document.createElement('div');
    $(ele).height(550);
    $(ele).width('100%');
    $(ele).addClass('textbox');
    $dom.hide();
    origin.parentElement.appendChild(ele);
    const value = $dom.val();
    const {
      onChange, language = 'markdown',
      theme = UserContext.monacoTheme || 'vs-light',
      model = `file://model-${Math.random().toString(16)}`,
    } = this.options;
    this.model = typeof model === 'string' ? monaco.editor.createModel(value, language, monaco.Uri.parse(model)) : model;
    this.editor = monaco.editor.create(
      ele,
      {
        theme,
        lineNumbers: true,
        glyphMargin: true,
        lightbulb: {
          enabled: true,
        },
        model: this.model,
      }
    );
    this.editor.addAction({
      id: 'theme-dark',
      label: 'Use dark theme',
      run: () => monaco.editor.setTheme('vs-dark'),
    });
    this.editor.addAction({
      id: 'theme-light',
      label: 'Use light theme',
      run: () => monaco.editor.setTheme('vs-light'),
    });
    this._subscription = this.editor.onDidChangeModelContent(() => {
      const val = this.editor.getValue();
      $dom.val(val);
      $dom.text(val);
      if (onChange) onChange(val);
    });
    this.isValid = true;
    if (hasFocus) this.editor.focus();
  }

  async initVditor() {
    const { default: Vditor } = await import('vditor');
    const { $dom } = this;
    const hasFocus = $dom.is(':focus');
    const origin = $dom.get(0);
    const ele = document.createElement('div');
    const value = $dom.val();
    const { onChange } = this.options;
    await new Promise((resolve) => {
      this.editor = new Vditor(ele, {
        ...config,
        ...this.options,
        after: resolve,
        input(v) {
          $dom.val(v);
          $dom.text(v);
          if (onChange) onChange(v);
        },
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

_.assign(Editor, DOMAttachedObject);
