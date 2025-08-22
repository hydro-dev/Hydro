import $ from 'jquery';
import { debounce } from 'lodash';
import { nanoid } from 'nanoid';
import React from 'react';
import ReactDOM from 'react-dom/client';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';
import { getTheme, i18n } from 'vj/utils';
import uploadFiles from '../upload';

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
type Options = MonacoOptions;

export default class Editor extends DOMAttachedObject {
  static DOMAttachKey = 'vjEditorInstance';
  model: import('../monaco').default.editor.IModel;
  editor: import('../monaco').default.editor.IStandaloneCodeEditor;
  markdownEditor: any;
  valueCache?: string;
  setMarkdownEditorValue?: (v: string) => void;
  reactRoot?: ReactDOM.Root;
  isValid: boolean;

  constructor($dom, public options: Options = {}) {
    super($dom);
    if (UserContext.preferredEditorType === 'monaco') this.initMonaco();
    else if (options.language && options.language !== 'markdown') this.initMonaco();
    else this.initMarkdownEditor();
  }

  async initMonaco() {
    const { load } = await import('vj/components/monaco/loader');
    const {
      onChange, language = 'markdown',
      theme = `vs-${getTheme()}`,
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
      lightbulb: { enabled: monaco.editor.ShowLightbulbIconMode.On },
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

  async initMarkdownEditor() {
    const pagename = document.documentElement.getAttribute('data-page');
    const isProblemPage = ['problem_create', 'problem_edit'].includes(pagename);
    const isProblemEdit = pagename === 'problem_edit';
    const that = this;
    const { $dom } = this;
    const hasFocus = $dom.is(':focus') || $dom.hasClass('autofocus');
    const origin = $dom.get(0);
    const ele = document.createElement('div');
    const value = $dom.val();
    const { onChange } = this.options;
    const { MdEditor } = await import('./mdeditor');

    const debouncedTrigger = debounce(() => {
      $(document.querySelector('.md-editor-preview')).trigger('vjContentNew');
    }, 500, { trailing: true });
    const renderCallback = (ref) => {
      this.markdownEditor = ref;
      setTimeout(debouncedTrigger, 200);
    };

    function EditorComponent() {
      const [val, setVal] = React.useState(value);
      that.setMarkdownEditorValue = setVal;
      return <MdEditor
        className="textbox"
        autoFocus={hasFocus}
        codeTheme="github"
        codeStyleReverse={false}
        ref={renderCallback}
        value={val}
        theme={getTheme()}
        noMermaid
        noPrettier
        noKatex
        noHighlight
        autoDetectCode
        toolbarsExclude={[
          // 'bold',
          // 'underline',
          // 'italic',
          // '-',
          // 'strikeThrough',
          // 'title',
          'sub',
          'sup',
          // 'quote',
          // 'unorderedList',
          // 'orderedList',
          // 'task',
          // '-',
          // 'codeRow',
          // 'code',
          // 'link',
          // 'image',
          // 'table',
          'mermaid',
          // 'katex',
          // '-',
          // 'revoke',
          // 'next',
          'save',
          // '=',
          'pageFullscreen',
          'fullscreen',
          // 'preview',
          'previewOnly',
          'htmlPreview',
          // 'catalog',
          'github',
        ]}
        onChange={(v) => {
          that.valueCache = v;
          setVal(v);
          $dom.val(v);
          $dom.text(v);
          onChange?.(v);
          setTimeout(debouncedTrigger, 100);
        }}
        onUploadImg={async (files, callback) => {
          let ext: string;
          const matches = files[0].type.match(/^image\/(png|jpg|jpeg|gif)$/i);
          if (matches) {
            [, ext] = matches;
          } else if (files[0].type === 'application/x-zip-compressed') {
            ext = 'zip';
          }
          if (!ext) return i18n('No Supported file type.');
          const filename = `${nanoid()}.${ext}`;
          await uploadFiles(isProblemEdit ? './files' : '/file', [files[0]], {
            type: isProblemEdit ? 'additional_file' : undefined,
            filenameCallback: () => filename,
          }).then(() => {
            callback([`${isProblemPage ? 'file://' : `/file/${UserContext._id}/`}${filename}`]);
          }).catch(() => {
            callback([]);
          });
          return null;
        }}
      />;
    }

    this.valueCache = value;

    this.reactRoot = ReactDOM.createRoot(ele);
    this.reactRoot.render(<EditorComponent />);
    $dom.hide();
    origin.parentElement.appendChild(ele);
    this.isValid = true;
    if (hasFocus) this.focus();
  }

  destroy() {
    this.detach();
    if (this.reactRoot) this.reactRoot.unmount();
    else if (this.editor?.dispose) this.editor.dispose();
  }

  ensureValid() {
    if (!this.isValid) throw new Error('Editor is not loaded');
  }

  value(val?: string) {
    this.ensureValid();
    if (typeof val === 'string') {
      if (this.editor) return this.editor.setValue(val);
      this.setMarkdownEditorValue?.(val);
      this.markdownEditor?.resetHistory?.();
    }
    if (this.editor) return this.editor.getValue({ lineEnding: '\n', preserveBOM: false });
    return this.valueCache;
  }

  focus() {
    this.ensureValid();
    if (!this.editor || !this.model) return;
    this.editor.focus();
    const range = this.model.getFullModelRange();
    this.editor.setPosition({ lineNumber: range.endLineNumber, column: range.endColumn });
  }
}
