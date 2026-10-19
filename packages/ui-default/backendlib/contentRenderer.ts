import type { Renderer, StatementEntry } from 'hydrooj';
import { ValidationError } from 'hydrooj';
import { escape } from 'lodash';
import markdown from './markdown';
import { ensureTag, xss } from './markdown-it-xss';

export const presetRenderers: Record<string, Renderer> = {
  md: { render: (entry) => ensureTag(markdown.render(entry.content || '')) },
  html: { render: (entry) => ensureTag(xss.process(entry.content || '')) },
  pdf: {
    render: (entry, ctx) => {
      const name = entry.file || entry.name;
      const src = `./${ctx.pdoc.docId}/file/${encodeURIComponent(name)}?noDisposition=1${ctx.tid ? `&tid=${ctx.tid}` : ''}`;
      return `<object><embed type="application/pdf" width="100%" style="min-height:100vh;border:none;" src="${escape(src)}"></object>`;
    },
  },
};

export function renderStatement(entry: StatementEntry, ctx: any) {
  const renderer = global.Hydro?.module?.contentRenderer?.[entry.name.split('.').pop()];
  if (!renderer) throw new ValidationError('statement.format', null, entry.name);
  return renderer.render(entry, ctx);
}
