import type { StatementEntry } from 'hydrooj';
import $ from 'jquery';
import EditorComponent from 'vj/components/editor/index';
import { i18n, tpl } from 'vj/utils';

export interface StatementEditorHandle {
  onChange(callback: (value: string) => void): void;
  destroy?(): void;
}

export interface StatementEditorContext {
  entry: StatementEntry;
  $container: JQuery<HTMLElement>;
}

export const editorRegistry: Record<string, (ctx: StatementEditorContext) => StatementEditorHandle> = new Proxy({
  __text: ({ entry, $container }) => {
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
        editor.model?.dispose();
      },
    };
  },
  pdf: ({ entry, $container }) => {
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
  },
}, {
  set(target, key, value) {
    target[key] = value;
    return true;
  },
  get(target, key) {
    const name = key.toString();
    return target[name.includes('.') ? name.split('.').pop().toLowerCase() : ''] || target.__text;
  },
});

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
