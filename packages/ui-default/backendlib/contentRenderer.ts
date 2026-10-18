import type { Renderer, StatementEntry } from 'hydrooj';
import { ValidationError } from 'hydrooj';
import { escape } from 'lodash';
import markdown from './markdown';
import { ensureTag, xss } from './markdown-it-xss';

export function extensionOf(name: string) {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

// Preset renderers; plugins register more (typst/latex/...) via ctx.provideModule('contentRenderer', ext, renderer)
const markdownRenderer: Renderer = {
  render: (entry) => ensureTag(markdown.render(entry.content || '')),
};

const htmlRenderer: Renderer = {
  render: (entry) => ensureTag(xss.process(entry.content || '')),
};

// Direct PDF embed, bypassing markdown entirely (see markdown-it-media.ts pdf branch)
const pdfRenderer: Renderer = {
  render: (entry, ctx) => {
    const name = entry.file || entry.name;
    const src = `./${ctx.pdoc.docId}/file/${encodeURIComponent(name)}?noDisposition=1${ctx.tid ? `&tid=${ctx.tid}` : ''}`;
    return `<object><embed type="application/pdf" width="100%" style="min-height:100vh;border:none;" src="${escape(src)}"></object>`;
  },
};

export const presetRenderers = {
  md: markdownRenderer,
  html: htmlRenderer,
  pdf: pdfRenderer,
};

export function renderStatement(entry: StatementEntry, ctx: any) {
  const renderer = global.Hydro?.module?.contentRenderer?.[extensionOf(entry.name)];
  if (!renderer) throw new ValidationError('statement.format', null, entry.name);
  return renderer.render(entry, ctx);
}
