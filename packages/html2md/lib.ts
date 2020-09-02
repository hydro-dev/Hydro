import 'hydrooj';
import TurndownService from 'turndown';
import { JSDOM } from 'jsdom';

const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
});

export function convertHTML(html: string) {
    const DOM = new JSDOM(html);
    const eles = DOM.window.document.querySelectorAll('span.katex-mathml');
    eles.forEach((ele) => {
        const MathML = ele.innerHTML
            .replace(/\\{/gmi, '{')
            .replace(/\\}/gmi, '}');
        ele.parentElement.replaceWith(`$${MathML}$`);
    });
    return turndownService.turndown(DOM.serialize());
}

global.Hydro.lib.convertHTML = convertHTML;
