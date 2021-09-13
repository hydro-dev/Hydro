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
    else if (options.language && options.language !== 'markdown') this.initMonaco();
    else this.initVditor();
  }

  async initMonaco() {
    const { default: monaco, registerAction } = await import('vj/components/monaco/index');
    const {
      onChange, language = 'markdown',
      theme = UserContext.monacoTheme || 'vs-light',
      model = `file://model-${Math.random().toString(16)}`,
      autoResize = true, autoLayout = true,
    } = this.options;
    const { $dom } = this;
    const hasFocus = $dom.is(':focus') || $dom.hasClass('autofocus');
    const origin = $dom.get(0);
    const ele = document.createElement('div');
    $(ele).width('100%').addClass('textbox');
    if (!autoResize && $dom.height()) $(ele).height($dom.height());
    $dom.hide();
    origin.parentElement.appendChild(ele);
    const value = this.options.value || $dom.val();
    // eslint-disable-next-line no-nested-ternary
    this.model = typeof model === 'string'
      ? monaco.editor.getModel(monaco.Uri.parse(model))
      || monaco.editor.createModel(value, language, monaco.Uri.parse(model))
      : model;
    this.model.setValue(value);
    this.model.updateOptions({ language });
    const cfg = {
      theme,
      lineNumbers: true,
      glyphMargin: true,
      lightbulb: { enabled: true },
      model: this.model,
      minimap: { enabled: false },
      hideCursorInOverviewRuler: true,
      overviewRulerLanes: 0,
      overviewRulerBorder: false,
    };
    if (autoLayout) cfg.automaticLayout = true;
    let prevHeight = 0;
    const updateEditorHeight = () => {
      const editorElement = this.editor.getDomNode();
      if (!editorElement) return;
      const lineHeight = this.editor.getOption(monaco.editor.EditorOption.lineHeight);
      const lineCount = this.editor.getModel()?.getLineCount() || 1;
      const height = this.editor.getTopForLineNumber(lineCount + 1) + lineHeight;
      if (prevHeight !== height) {
        prevHeight = height;
        editorElement.style.height = `${height}px`;
        this.editor.layout();
      }
    };
    if (autoResize) {
      cfg.scrollbar = {
        vertical: 'hidden',
        horizontal: 'hidden',
        handleMouseWheel: false,
      };
      cfg.wordWrap = 'bounded';
      cfg.scrollBeyondLastLine = false;
    }
    this.editor = monaco.editor.create(ele, cfg);
    registerAction(this.editor, this.model, this.$dom);
    if (autoResize) {
      this.editor.onDidChangeModelDecorations(() => {
        updateEditorHeight(); // typing
        requestAnimationFrame(updateEditorHeight); // folding
      });
    }
    this._subscription = this.editor.onDidChangeModelContent(() => {
      const val = this.editor.getValue();
      $dom.val(val);
      $dom.text(val);
      if (onChange) onChange(val);
    });
    this.isValid = true;
    if (hasFocus) this.focus();
    if (autoResize) updateEditorHeight();
    window.model = this.model;
    window.editor = this.editor;
  }

  async initVditor() {
    const { default: Vditor } = await import('vditor');
    const { $dom } = this;
    const hasFocus = $dom.is(':focus') || $dom.hasClass('autofocus');
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

  destory() {
    this.detach();
    if (this.editor?.destory) this.editor.destory();
    else if (this.editor?.dispose) this.editor.dispose();
  }

  ensureValid() {
    if (!this.isValid) throw new Error('Editor is not loaded');
  }

  /**
   * @param {string?} val
   * @returns {string}
   */
  value(val) {
    this.ensureValid();
    if (typeof val === 'string') return this.editor.setValue(val);
    return this.editor.getValue();
  }

  focus() {
    this.ensureValid();
    this.editor.focus();
    const range = this.model.getFullModelRange();
    this.editor.setPosition({ lineNumber: range.endLineNumber, column: range.endColumn });
  }
}

_.assign(Editor, DOMAttachedObject);
