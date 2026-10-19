import $ from 'jquery';
import EditorComponent from 'vj/components/editor/index';
import { i18n, tpl } from 'vj/utils';

// Statement editor registry — frontend counterpart of the server-side contentRenderer.
// Plugins register custom editors per extension (e.g. a typst editor with preview);
// unknown extensions fall back to the plain text editor.

export interface StatementEntryLike {
  name: string;
  lang: string;
  content?: string;
  file?: string;
  render?: any;
}

export interface StatementEditorHandle {
  onChange(callback: (value: string) => void): void;
  destroy?(): void;
}

export interface StatementEditorContext {
  entry: StatementEntryLike;
  $container: JQuery<HTMLElement>;
}

export type StatementEditorFactory = (ctx: StatementEditorContext) => StatementEditorHandle;

const registry: Record<string, StatementEditorFactory> = {};

export function registerStatementEditor(extensions: string[], factory: StatementEditorFactory) {
  for (const ext of extensions) registry[ext] = factory;
}

export function resolveStatementEditor(name: string): StatementEditorFactory {
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  return registry[ext] || registry.__text;
}

const textEditor: StatementEditorFactory = ({ entry, $container }) => {
  // Initial value goes through the DOM: the Editor component initializes async,
  // so calling its value() right after construction throws / is a no-op.
  const $textarea = $(tpl`<textarea data-editor class="textbox auto-resize"></textarea>`)
    .val(entry.content ?? '');
  $container.append($textarea);
  let cb: (value: string) => void = () => { };
  const editor = EditorComponent.getOrConstruct<EditorComponent>($textarea, { onChange: (value: string) => cb(value) });
  return {
    onChange(callback: (value: string) => void) {
      cb = callback;
    },
    destroy() {
      editor.destroy();
    },
  };
};

const fileEditor: StatementEditorFactory = ({ entry, $container }) => {
  const viewUrl = `./file/${encodeURIComponent(entry.file || entry.name)}`;
  $container.append($(tpl`
    <div class="section__body" style="border:1px dashed var(--palette-color-secondary, #ccc);padding:16px;text-align:center">
      <p><span class="icon icon-file"></span> ${entry.file || entry.name}</p>
      <p class="note">${i18n('This statement is a binary file stored in additional files.')}</p>
      <a class="rounded button" href="${viewUrl}" target="_blank">${i18n('View')}</a>
    </div>`));
  return {
    onChange() { },
  };
};

registerStatementEditor(['pdf'], fileEditor);

registry.__text = textEditor;

// ---- statement kinds (the "Add statement" buttons) ----
// Text kinds create an empty entry with a default name; upload kinds pick a file
// (stored per the entry's `file` field) and reference it. Plugins register both
// a kind (add button) and an editor (edit area) — e.g. a typst plugin adds
// { id: 'typst', extension: 'typ', label: ... } plus its editor for 'typ'.

export interface StatementKind {
  id: string;
  label: string; // i18n key
  extension?: string; // text kinds: default entry name extension
  accept?: string; // upload kinds: file input accept pattern
}

export const statementKinds: StatementKind[] = [
  { id: 'markdown', label: 'Add Markdown Statement', extension: 'md' },
  { id: 'html', label: 'Add HTML Statement', extension: 'html' },
  { id: 'pdf', label: 'Upload PDF Statement', accept: 'application/pdf,.pdf' },
];
