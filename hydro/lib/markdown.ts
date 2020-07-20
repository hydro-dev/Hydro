import MarkdownIt from 'markdown-it';
import Prism from 'prismjs';

// For math: $a\times b\eq 10$
// Specific image size: ![image](image.png =100x100)
import Imsize from 'markdown-it-imsize';
/* Footnote support.
Here is a footnote reference,[^1] and another.[^longnote]

[^1]: Here is the footnote.

[^longnote]: Here's one with multiple blocks.

    Subsequent paragraphs are indented to show that they
belong to the previous footnote.
*/
import Footnote from 'markdown-it-footnote';
// ==Highlight==
import Mark from 'markdown-it-mark';
import TOC from 'markdown-it-table-of-contents';
import Anchor from 'markdown-it-anchor';

require('prismjs/components/index');

type Plugin = MarkdownIt.PluginSimple | MarkdownIt.PluginWithOptions | MarkdownIt.PluginWithParams;

class Markdown extends MarkdownIt {
    constructor() {
        super({
            linkify: true,
            highlight(str, lang) {
                if (lang && Prism.languages[lang]) {
                    try {
                        return Prism.highlight(str, Prism.languages[lang], lang);
                    } catch (__) { } // eslint-disable-line no-empty
                }
                return '';
            },
        });
        this.linkify.tlds('.py', false);
        this.use(Imsize);
        this.use(Footnote);
        this.use(Mark);
        this.use(Anchor);
        this.use(TOC);
    }
}

export const md = new Markdown();

export function plugin(func: Plugin, ...args: any[]) {
    md.use(func, ...args);
}

export function render(text: string, html = false) {
    md.set({ html: !!html });
    return md.render(text);
}

export function renderInline(text: string, html = false) {
    md.set({ html: !!html });
    return md.renderInline(text);
}

global.Hydro.lib.markdown = {
    md, plugin, render, renderInline,
};
