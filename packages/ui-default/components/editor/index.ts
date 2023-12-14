import $ from 'jquery';
import _ from 'lodash';
import { nanoid } from 'nanoid';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';
import Notification from 'vj/components/notification';
import { i18n, request } from 'vj/utils';

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
    theme: {
      path: `${UiContext.cdn_prefix}vditor/dist/css/content-theme`,
      current: 'light',
    },
  },
};

interface MonacoOptions {
  language?: string;
  onChange?: (val: string) => any;
  theme?: string;
  model?: string;
  autoResize?: boolean;
  autoLayout?: boolean;
  value?: string;
  hide?: string[];
  lineNumbers?: 'on' | 'off' | 'relative' | 'interval';
}
interface VditorOptions {
  theme?: 'classic' | 'dark'
}
type Options = MonacoOptions & VditorOptions;

export default class Editor extends DOMAttachedObject {
  static DOMAttachKey = 'vjEditorInstance';
  model: import('../monaco').default.editor.IModel;
  editor: import('../monaco').default.editor.IStandaloneCodeEditor;
  vditor: import('vditor').default;
  isValid: boolean;

  constructor($dom, public options: Options = {}) {
    super($dom);
    if (UserContext.preferredEditorType === 'monaco') this.initMonaco();
    else if (options.language && options.language !== 'markdown') this.initMonaco();
    else this.initVditor();
  }

  async initMonaco() {
    const { load } = await import('vj/components/monaco/loader');
    const {
      onChange, language = 'markdown',
      theme = UserContext.monacoTheme || 'vs-light',
      model = `file://model-${Math.random().toString(16)}`,
      autoResize = true, autoLayout = true,
      hide = [], lineNumbers = 'on',
    } = this.options;
    const { monaco, registerAction } = await load([language]);
    const { $dom } = this;
    const hasFocus = $dom.is(':focus') || $dom.hasClass('autofocus');
    const origin = $dom.get(0);
    const ele = document.createElement('div');
    $(ele).width('100%').addClass('textbox');
    if (!autoResize && $dom.height()) $(ele).height($dom.height());
    $dom.hide();
    origin.parentElement.appendChild(ele);
    const value = this.options.value || $dom.val();
    this.model = typeof model === 'string'
      ? monaco.editor.getModel(monaco.Uri.parse(model))
      || monaco.editor.createModel(value, language === 'auto' ? undefined : language, monaco.Uri.parse(model))
      : model;
    if (!this.options.model) this.model.setValue(value);
    const cfg: import('../monaco').default.editor.IStandaloneEditorConstructionOptions = {
      theme,
      lineNumbers,
      glyphMargin: true,
      lightbulb: { enabled: true },
      model: this.model,
      minimap: { enabled: false },
      hideCursorInOverviewRuler: true,
      overviewRulerLanes: 0,
      overviewRulerBorder: false,
      fontFamily: UserContext.codeFontFamily,
      fontLigatures: '',
      unicodeHighlight: {
        ambiguousCharacters: language !== 'markdown',
      },
    };
    if (autoLayout) cfg.automaticLayout = true;
    let prevHeight = 0;
    const updateEditorHeight = () => {
      const editorElement = this.editor.getDomNode();
      if (!editorElement) return;
      const lineHeight = this.editor.getOption(monaco.editor.EditorOption.lineHeight);
      const lineCount = this.editor.getModel()?.getLineCount() || 1;
      let height = this.editor.getTopForLineNumber(lineCount + 1) + lineHeight;
      if (prevHeight !== height) {
        if (window.innerHeight * 1.5 < height) {
          height = window.innerHeight;
          this.editor.updateOptions({
            scrollbar: {
              vertical: 'auto',
              horizontal: 'auto',
              handleMouseWheel: true,
            },
          });
        } else {
          this.editor.updateOptions({
            scrollbar: {
              vertical: 'hidden',
              horizontal: 'hidden',
              handleMouseWheel: false,
            },
          });
        }
        prevHeight = height;
        editorElement.style.height = `${height}px`;
        this.editor.layout();
      }
    };
    if (autoResize) {
      cfg.wordWrap = 'bounded';
      cfg.scrollBeyondLastLine = false;
    }
    this.editor = monaco.editor.create(ele, cfg);
    if (hide.length) {
      const ranges = [];
      for (const text of hide) {
        const found = this.model.findMatches(text, true, false, true, '', true);
        ranges.push(...found.map((i) => i.range));
      }
      this.editor.deltaDecorations([], ranges.map((range) => ({ range, options: { inlineClassName: 'decoration-hide' } })));
    }
    registerAction(this.editor, this.model, this.$dom);
    if (autoResize) {
      this.editor.onDidChangeModelDecorations(() => {
        updateEditorHeight(); // typing
        requestAnimationFrame(updateEditorHeight); // folding
      });
    }
    this.editor.onDidChangeModelContent(() => {
      const val = this.editor.getValue({ lineEnding: '\n', preserveBOM: false });
      $dom.val(val);
      $dom.text(val);
      if (onChange) onChange(val);
    });
    this.isValid = true;
    if (hasFocus) this.focus();
    if (autoResize) updateEditorHeight();
    // @ts-ignore
    window.model = this.model;
    // @ts-ignore
    window.editor = this.editor;
  }

  async initVditor() {
    const pagename = document.documentElement.getAttribute('data-page');
    const isProblemPage = ['problem_create', 'problem_edit'].includes(pagename);
    const isProblemEdit = pagename === 'problem_edit';
    const { default: Vditor } = await import('vditor');
    const { $dom } = this;
    const hasFocus = $dom.is(':focus') || $dom.hasClass('autofocus');
    const origin = $dom.get(0);
    const ele = document.createElement('div');
    const value = $dom.val();
    const { onChange } = this.options;
    await new Promise((resolve) => {
      this.vditor = new Vditor(ele, {
        ...config,
        upload: {
          multiple: false,
          handler: (files) => {
            let wrapper = ['', ''];
            let ext: string;
            const matches = files[0].type.match(/^image\/(png|jpg|jpeg|gif)$/i);
            if (matches) {
              wrapper = ['![image](', ')'];
              [, ext] = matches;
            } else if (files[0].type === 'application/x-zip-compressed') {
              wrapper = ['[file](', ')'];
              ext = 'zip';
            }
            if (!ext) return i18n('No Supported file type.');
            const filename = `${nanoid()}.${ext}`;
            const data = new FormData();
            data.append('filename', filename);
            data.append('file', files[0]);
            data.append('operation', 'upload_file');
            if (isProblemEdit) data.append('type', 'additional_file');
            let progress = 0;
            request.postFile(isProblemEdit ? './files' : '/file', data, {
              xhr: () => {
                const xhr = new XMLHttpRequest();
                xhr.upload.addEventListener('loadstart', () => this.vditor.vditor.tip.show(i18n('Uploading...'), 0));
                xhr.upload.addEventListener('progress', (e) => {
                  if (!e.lengthComputable) return;
                  const percentComplete = Math.round((e.loaded / e.total) * 100);
                  if (percentComplete === progress) return;
                  progress = percentComplete;
                  this.vditor.vditor.tip.show(`${i18n('Uploading...')} ${percentComplete}%`, 0);
                }, false);
                return xhr;
              },
            })
              .then(() => {
                this.vditor.insertValue(`${wrapper.join(`${isProblemPage ? 'file://' : `/file/${UserContext._id}/`}${filename}`)} `);
                this.vditor.vditor.tip.hide();
              })
              .catch((e: { message: string; }) => {
                console.error(e);
                return `${i18n('Upload Failed')}: ${e.message}`;
              });
            return null;
          },
        },
        ...this.options,
        after: () => {
          const pos = $(ele).find('button[data-mode="sv"]').get();
          const button = $('<button data-mode="monaco">Monaco Editor</button>');
          button.on('click', (e) => {
            Notification.info('You can select this in PreferenceSettings');
            e.preventDefault();
          });
          button.insertAfter(pos);
          resolve(null);
        },
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
    if (this.vditor?.destroy) this.vditor.destroy();
    else if (this.editor?.dispose) this.editor.dispose();
  }

  ensureValid() {
    if (!this.isValid) throw new Error('Editor is not loaded');
  }

  value(val?: string) {
    this.ensureValid();
    if (typeof val === 'string') return (this.editor || this.vditor).setValue(val);
    return (this.editor || this.vditor).getValue({ lineEnding: '\n', preserveBOM: false });
  }

  focus() {
    this.ensureValid();
    this.vditor?.focus();
    if (!this.editor || !this.model) return;
    this.editor.focus();
    const range = this.model.getFullModelRange();
    this.editor.setPosition({ lineNumber: range.endLineNumber, column: range.endColumn });
  }
}

_.assign(Editor, DOMAttachedObject);
